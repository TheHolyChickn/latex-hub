#!/bin/python3
from courses import Courses
from config import ROOT
from homework import init_homework

init_homework()

for course in Courses():
        lectures = course.lectures
        course_title = lectures.course.info["title"]
        course_college = lectures.course.info["college"]
        course_department = lectures.course.info["department"]
        course_id = lectures.course.info["course_id"]
        lines = [r'\documentclass[11pt, letterpaper]{report}',
                 r'\input{../preamble.tex}',
                 r'\usepackage{titlepage}',
                 fr'\title{{{course_title}}}',
                 fr'\courseID{{{course_id}}}',
                 fr'\college{{{course_college}}}',
                 fr'\department{{{course_department}}}',
                 r'\begin{document}',
                 r'    \maketitle',
                 r'    \tableofcontents',
                 fr'    % start lectures',
                 fr'    % end lectures',
                 r'\end{document}'
                ]
        lectures.master_file.touch()
        lectures.master_file.write_text('\n'.join(lines))
        (lectures.root / 'master.tex.latexmain').touch()
        (lectures.root / 'figures').mkdir(exist_ok=True)
        (lectures.root / 'Homework').mkdir(exist_ok=True)
