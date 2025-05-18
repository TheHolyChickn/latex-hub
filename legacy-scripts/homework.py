#!/bin/python3

from config import ROOT
from courses import Courses
import json
from os.path import join
import subprocess
from datetime import datetime

homework_path = join(ROOT, 'homeworks.json')
courses = Courses()

# initializes the homework file, should only be called in init-all-courses.py
def init_homework():
    course_dict = {course.name: {} for course in courses}
    json_data = json.dumps(course_dict, indent=4)
    with open(homework_path, 'w') as file:
        file.write(json_data)

class Homework():
    # The Homework() class stores important data about homework objects
    def __init__(self, item, course, number):
        self.name = item['name']
        self.date = item['date']
        self.preamble = item['preamble']
        self.status = bool(item['status'])
        self.number = number
        self.course = course
        self.path = join(ROOT, self.course, 'Homework', f"{self.name}_{self.number}.tex")

    # since self.course is a string, we sometimes have to find the matching course object in courses
    def extract_course(self):
        for course in courses:
            if course.name == self.course:
                return course

    # troubleshooting function, lets me call print(homework)
    def __repr__(self):
        return (
            "Homework:\n"
            f"  Name: {self.name!r},\n"
            f"  Date: {self.date!r},\n"
            f"  Preamble: {self.preamble!r},\n"
            f"  Status: {self.status!r},\n"
            f"  Course: {self.course!r}\n"
        )
    
    # opens a homework assignment
    def open_homework(self):
        subprocess.Popen([
            "kitty",
            "-e", "bash", "-i", "-c",
            f"\\nvim {str(self.path).replace(' ', '\\ ')}"
            ])

    # writes a latex file for the homework assignment
    def touch(self):
        course = self.extract_course()
        if course:
            course_ID = course.info["course_id"]
            course_section = course.info["section"]
            professor = course.info["professor"]
        else:
            course_ID = ""
            course_section = ""
            professor = ""

        if self.preamble == "report":
            line1 = r'\input{../../../../report.tex}' 
            line2 = r'\makereport'
        else:
            line1 = r'\input{../../homework.tex}'
            line2 = r'\makeproblem'
        lines = [r'\documentclass[11pt, letterpaper]{article}',
                 line1,
                 r'\usepackage{titlepage}',
                 fr'\title{{{self.name}}}',
                 fr'\courseID{{{course_ID}}}',
                 fr'\courseSection{{{course_section}}}',
                 fr'\professor{{{professor}}}',
                 r'\begin{document}',
                 line2,
                 r'\end{document}'
                 ]
        with open(self.path, 'w') as file:
            file.write('\n'.join(lines))

    # method for parsing some of a homework assignment's contents as a json-readable file
    def to_json(self):
        return {
                "name": self.name,
                "date": self.date,
                "preamble": self.preamble,
                "status": self.status
                }

class Homeworks():
    # the homeworks class contains a list of homework assignments, and is initialized from a json file
    def __init__(self):
        with open(homework_path) as file:
            json_data = json.load(file)

        assignments = {course: [] for course in json_data}
        for course, items in json_data.items():
            if items:
                for idx, item in enumerate(items.values(), start=1): # chatgpt said to change items to items.values(), idk what that does ngl it works fine with both
                    assignments[course].append(Homework(item, course, str(idx)))
        self.list = assignments

    # this method updates the json file with the current contents of a Homework() object
    def update(self):
        with open(homework_path, 'w') as file:
            file.write(str(self))

    # debugging method, basically just lets you call print(homeworks)
    def __str__(self):
        return json.dumps(self.to_json(), indent=4)
    
    # refactors self.list into json-readable format
    def to_json(self):
        data = {course: {} for course in self.list}
        for course in self.list:
            for homework in self.list[course]:
                data[course][homework.number] = homework.to_json()
        return data

    # adds a new homework
    def new_homework(self, info):
        # try-except protocol incase a list is empty
        try:
            number = str(int(self.list[info['course']][-1].number) + 1)
        except IndexError:
            number = "1"

        # parse the information
        homework = Homework(info, info['course'], number)
        self.list[info['course']].append(homework)

        # update the json file and open the homework
        self.update()
        homework.touch()
        homework.open_homework()

    # input should consist of a dictionary of the form info = {"course": "COURSE", "number": "NUMBER"}
    # finds the homework assignment with that number in that course
    def find_homework(self, info):
        for homework in self.list[info['course']]:
            if homework.number == info['number']:
                return homework

    # opens a homework assignment
    def open_homework(self, info):
        self.find_homework(info).open_homework()

    # marks a homework as complete
    def complete_homework(self, info):
        self.find_homework(info).status = True
        self.update()

    # sends the list, sorted by date
    def sort(self):
        incomplete = []
        for course in self.list:
            for homework in self.list[course]:
                if not homework.status:
                    incomplete.append(homework)

        incomplete.sort(key=lambda homework: datetime.strptime(homework.date, "%m/%d/%y"))
        return incomplete
