'use strict';

const { GLib, Gio } = imports.gi;
const ByteArray = imports.byteArray;

const { Lecture, TEX_LECTURE_DATE_FORMAT: DEFAULT_TEX_DATE_FORMAT } = imports.core.Lecture;

var Lectures = class Lectures {
    constructor(course) {
        this.course = course;
        this.root = course.path;
        this.masterFile = this.root.get_child('master.tex');
        this.lecturesList = [];

        this._readFiles();
    }

    _numberToFilename(n) {
        return `lec_${n.toString().padStart(2, '0')}.tex`;
    }

    reloadLectures() {
        this._readFiles();
    }

    _readFiles() {
        this.lecturesList = [];

        if (!this.root.query_exists(null)) {
            console.warn(`Course directory not found: ${this.root.get_path()}`);
            return;
        }

        try {
            const enumerator = this.root.enumerate_children(
                'standard::name,standard::type',
                Gio.FileQueryInfoFlags.NONE,
                null
            );

            let fileInfo;
            while ((fileInfo = enumerator.next_file(null)) !== null) {
                const fileName = fileInfo.get_name();
                if (fileName.match(/^lec_\d+\.tex$/)) {
                    const lectureFile = this.root.get_child(fileName);
                    this.lecturesList.push(new Lecture(lectureFile, this.course));
                }
            }
            enumerator.close(null);
            this.lecturesList.sort((a, b) => a.number - b.number);
        } catch (e) {
            console.error(`Error reading lecture files for course ${this.course.name}: ${e.message}`);
        }
    }

    getLectureByNumber(number) {
        return this.lecturesList.find(lec => lec.number === number) || null;
    }

    getLastLecture() {
        return this.lecturesList.length > 0 ? this.lecturesList[this.lecturesList.length - 1] : null;
    }

    parseLectureSpec(specString) {
        if (this.lecturesList.length === 0 && (specString === 'last' || specString === 'prev')) {
            return null;
        }
        if (specString.match(/^\d+$/)) {
            return parseInt(specString, 10);
        } else if (specString === 'last') {
            const lastLec = this.getLastLecture();
            return lastLec ? lastLec.number : null;
        } else if (specString === 'prev') {
            const lastLec = this.getLastLecture();
            return lastLec && lastLec.number > 1 ? lastLec.number - 1 : null;
        }
        return null;
    }

    parseRangeString(rangeArg) {
        const allNumbers = this.lecturesList.map(lec => lec.number);
        if (allNumbers.length === 0 && rangeArg !== 'all') return [];

        if (rangeArg === 'all') {
            return allNumbers;
        }

        if (rangeArg.includes('-')) {
            const parts = rangeArg.split('-');
            const startSpec = this.parseLectureSpec(parts[0]);
            const endSpec = this.parseLectureSpec(parts[1]);
            if (startSpec !== null && endSpec !== null && startSpec <= endSpec) {
                return allNumbers.filter(n => n >= startSpec && n <= endSpec);
            }
        } else {
            const singleSpec = this.parseLectureSpec(rangeArg);
            if (singleSpec !== null && allNumbers.includes(singleSpec)) {
                return [singleSpec];
            }
        }
        return [];
    }

    _getHeaderFooter(filePath) {
        let header = '';
        let footer = '';
        let part = 0; // 0 = header, 1 = body, 2 = footer

        if (!filePath.query_exists(null)) {
            console.warn(`Master file not found: ${filePath.get_path()}.`);
            return null;
        }

        try {
            const [success, contents] = filePath.load_contents(null);
            if (!success) throw new Error("Failed to load master file contents.");

            const lines = ByteArray.toString(contents).split('\n');
            for (const line of lines) {
                if (line.includes('% end lectures')) part = 2;

                if (part === 0) header += line + '\n';
                if (part === 2) footer += line + '\n';
                if (line.includes('% start lectures')) part = 1;
            }

            if (!header.includes('% start lectures')) {
                header = (header.trimEnd() + '\n    % start lectures\n').trimStart();
            }
            if (!footer.includes('% end lectures')) {
                footer = ('    % end lectures\n' + footer.trimStart()).trimEnd() + '\n';
            }
        } catch (e) {
            console.error(`Error reading header/footer from ${filePath.get_path()}: ${e.message}`);
            header = '    % start lectures\n';
            footer = '    % end lectures\n';
        }
        return { header, footer };
    }

    updateLecturesInMaster(lectureNumbers) {
        const { header, footer } = this._getHeaderFooter(this.masterFile);
        const sortedNumbers = [...new Set(lectureNumbers)].sort((a, b) => a - b);

        let body = '';
        for (const number of sortedNumbers) {
            body += `    \\input{${this._numberToFilename(number)}}\n`;
        }

        const newContent = header.trimEnd() + '\n' + body.trimEnd() + '\n' + footer.trimStart();
        try {
            this.masterFile.replace_contents(newContent, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
        } catch (e) {
            console.error(`Failed to update master file ${this.masterFile.get_path()}: ${e.message}`);
        }
    }

    newLecture() {
        let newLectureNumber = 1;
        if (this.lecturesList.length > 0) {
            const lastLecture = this.getLastLecture();
            newLectureNumber = this.getLastLecture().number + 1;
        }

        const newLectureFileName = this._numberToFilename(newLectureNumber);
        const newLectureFile = this.root.get_child(newLectureFileName);

        const today = GLib.DateTime.new_now_local();
        const dateStringForTex = today.format(DEFAULT_TEX_DATE_FORMAT);
        const defaultTitle = "";

        const newLectureContent = `\\lecture{${newLectureNumber}}{${dateStringForTex}}{${defaultTitle}}\n`;

        try {
            newLectureFile.replace_contents(newLectureContent, null, false, Gio.FileCreateFlags.NONE, null);
            const newLectureObj = new Lecture(newLectureFile, this.course);
            this.lecturesList.push(newLectureObj);
            this.lecturesList.sort((a, b) => a.number - b.number);

            const allCurrentNumbers = this.lecturesList.map(l => l.number);
            this.updateLecturesInMaster(allCurrentNumbers);
            return newLectureObj;
        } catch (e) {
            console.error(`Failed to create new lecture ${newLectureFileName}: ${e.message}`);
            return null;
        }
    }

    compileMaster() {
        if (!this.masterFile.query_exists(null)) {
            console.error(`Master file ${this.masterFile.get_path()} does not exist. Cannot compile.`);
            return -1;
        }
        const command = ['latexmk', '-f', '-interaction=nonstopmode', this.masterFile.get_basename()];
        const workingDir = this.root.get_path();
        try {
            const [success, stdout, stderr, wait_status] = GLib.spawn_sync(
                workingDir, command, null, GLib.SpawnFlags.SEARCH_PATH, null
            );
            if (!success) {
                console.error(`Failed to spawn latexmk. Stdout: ${ByteArray.toString(stdout)} Stderr: ${ByteArray.toString(stderr)}`);
                return -1;
            }
            if (wait_status !== 0) {
                console.warn(`latexmk completed with non-zero status (${wait_status}). Stderr: ${ByteArray.toString(stderr)}`);
            }
            return wait_status;
        } catch (e) {
            console.error(`Error running latexmk: ${e.message}`);
            return -1;
        }
    }

    [Symbol.iterator]() {
        return this.lecturesList[Symbol.iterator]();
    }

    get length() {
        return this.lecturesList.length;
    }

    get(index) {
        return this.lecturesList[index];
    }
};

var exports = { Lectures };