'use strict';

const { rofi } = imports.core.Rofi;
const { generateShortTitle, MAX_LEN } = imports.core.RofiUtils;
const { Courses } = imports.core.Courses;
const { Homeworks } = imports.core.Homeworks;

// course management

function selectCourse() {
    const courses = new Courses();
    const current = courses.current;
    const courseTitles = courses.coursesList.map(c => c.info.title || c.name);
    let rofiArgs = ['-l', courses.length.toString()];

    let currentIndex = -1;
    if (current) {
        currentIndex = courses.coursesList.findIndex(c => c.equals(current));
    }

    if (currentIndex !== -1) {
        rofiArgs.push('-a', currentIndex.toString());
    }

    const { key, index, _ } = rofi('Select course', courseTitles, rofiArgs);
    if (key === 0 && index !== -1) {
        const selectedCourse = courses.get(index);
        courses.current = selectedCourse;
        console.log(`Set current course to ${selectedCourse.name}`);
        return selectedCourse;
    }
    return null;
}

// lectures

function selectLecture() {
    const courses = new Courses();
    const current = courses.current;
    if (!current) {
        rofi('Error', ['No current course selected.'], ['-l', '1']);
        return;
    }

    const lectures = current.lectures;
    const sortedLectures = [...lectures].sort((a, b) => b.number - a.number);

    const options = sortedLectures.map(lec => {
        const title = generateShortTitle(lec.title);
        const dateStr = lec.date ? lec.date.format('%a %d %b') : 'No Date';
        return `${lec.number.toString().padStart(2, ' ')}. <b>${title}</b> <span size='smaller'>${dateStr}</span>`;
    })

    const rofiArgs = ['-l', `${sortedLectures.length}`, '-markup-rows', '-kb-row-down', 'Down', '-kb-custom-1', 'Ctrl+n'];
    const { key, index, _ } = rofi('Select lecture', options, rofiArgs);

    if (key === 0 && index !== -1) {
        sortedLectures[index].edit();
    } else if (key === 1) { // new lec
        const newLecture = lectures.newLecture();
        if (newLecture) newLecture.edit();
    }
}

function selectLectureView() {
    const courses = new Courses();
    const current = courses.current;
    if (!current) {
        rofi('Error', ['No current course selected.'], ['-l', '1']);
        return;
    }

    const commands = ['last', 'all', 'prev'];
    const options = ['Current lecture', 'All lectures', 'Previous lectures'];
    const { key, index, _ } = rofi('Select view', options, ['-l', '3', '-auto-select']);

    if (key === 0 && index !== -1) {
        const command = commands[index];
        const lectures = current.lectures;
        const lectureRange = lectures.parseRangeString(command);
        lectures.updateLecturesInMaster(lectureRange);
        lectures.compileMaster();
        console.log(`Compiled master for ${current.name} with view: ${options[index]}`);
    }
}

// homeworks

function _createNewHomework() {
    const courses = new Courses();
    const homeworks = new Homeworks(courses);

    const courseTitles = courses.coursesList.map(c => c.info.title || c.name);
    const courseResult = rofi('Select course', courseTitles, ['-l', `${courseTitles.length}`]);
    if (courseResult.key !== 0) return;
    const selectedCourseName = courses.get(courseResult.index).name;

    const nameResult = rofi('Enter assignment title', [], ['-l', '0']);
    if (nameResult.key !== 0 || !nameResult.selected) return;

    const dateResult = rofi('Enter due date (MM/DD/YY)', [], ['-l', '0']);
    if (dateResult.key !== 0 || !dateResult.selected) return;

    const preambleResult = rofi('Select assignment type', ["Homework", "Report"], ['-l', '2']);
    if (preambleResult.key !== 0) return;

    homeworks.addHomework(selectedCourseName, {
        name: nameResult.selected,
        date: dateResult.selected,
        preamble: preambleResult.selected.toLowerCase(),
        status: false
    });
}

function manageHomework() {
    const courses = new Courses();
    const homeworks = new Homeworks(courses);
    const sortedHomeworks = homeworks.getSortedIncompleteHomeworks();

    const options = sortedHomeworks.map(hw => {
        const title = generateShortTitle(hw.name);
        return `<b>${title}</b> <span size="smaller">${hw.date} (${hw.course.info.short})</span>`;
    });

    const rofiArgs = [
        '-l', `${Math.min(7, sortedHomeworks.length)}`,
        '-markup-rows',
        '-kb-row-down', 'Down',
        '-kb-custom-1', 'Ctrl+n', // new
        '-kb-custom-2', 'Ctrl+x' // complete
    ];

    const { key, index, _ } = rofi('Select course', options, rofiArgs);

    if (key === 0 && index !== -1) { // open
        sortedHomeworks[index].openHomework();
    } else if (key === 1) { // new
        _createNewHomework();
    } else if (key === 2) { // complete
        const completeResult = rofi('Complete Assignment', options, rofiArgs);
        if (completeResult.key === 0 && completeResult.index !== -1) {
            const hwToComplete = sortedHomeworks[completeResult.index];
            homeworks.completeHomework(hwToComplete.course.name, hwToComplete.number);
            console.log(`Completed: ${hwToComplete.name}`);
        }
    }
}

var exports = {
    selectCourse,
    selectLecture,
    selectLectureView,
    manageHomework
};