#!/bin/python3

import subprocess
from rofi import rofi
from utils import generate_short_title, MAX_LEN
from homework import Homeworks

homeworks = Homeworks()
sorted_homeworks = homeworks.sort()


options = [
        "<b>{title}</b> <span size='smaller'>{date} ({course})</span>".format(
            fill = MAX_LEN,
            title = generate_short_title(homework.name),
            date = homework.date,
            course = homework.extract_course().info['title']
        )
        for homework in sorted_homeworks
]
args = [
    '-l', min(7,len(sorted_homeworks)),
    '-markup-rows',
    '-kb-row-down', 'Down',
    '-kb-custom-1', 'Ctrl+n',
    '-kb-custom-2', 'Ctrl+x',
    '-eh', '2'
]

key, index, selected = rofi('Select Assignment', options, args)

# key == 0 indicates a selection
# key == 1 indicates Ctrl+n pressed
# key == 2 indicates Ctrl+x pressed

if key == 0:
    sorted_homeworks[index].open_homework()

elif key == 1:
    # grab course
    key, index, course = rofi('Select course', [course for course in homeworks.list], [
        '-auto-select',
        '-no-custom',
        '-l', len(homeworks.list)
    ])
    name = subprocess.run(
            ['rofi', '-dmenu', '-l', '0', '-p', 'Enter assignment title'],
            text=True,
            capture_output=True,
            check=True
    )
    date = subprocess.run(
            ['rofi', '-dmenu' , '-p', 'Enter due date', '-l', '0'],
            text=True,
            capture_output=True,
            check=True
    )
    # '-theme-str', '"listview {enabled: false;}"'
    key, index, preamble = rofi('Select assignment type', ["Report", "Preamble"], [
        '-l', '2',
        '-no-custom'
    ])
    preamble = preamble.lower()
    info = {"name": name.stdout.strip().strip(), "date": date.stdout.strip().strip(), "preamble": preamble, "course": course, "status": False}
    homeworks.new_homework(info)

elif key == 2:
    # spawn the same menu as opening but this time complete the selection
    key, index, selected = rofi('Complete Assignment', options, args)
    info = {
            "course": sorted_homeworks[index].course,
            "number": sorted_homeworks[index].number
    }
    homeworks.complete_homework(info)
