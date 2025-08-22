# LaTeX Hub

An app for managing university course files and LaTeX heavy projects. Comes with a GUI solution, written using gjs and GTK widgets; and a CLI solution
for integration into hotkey daemons (as paired with WMs) for quick access to rofi menus, and the like.

## What the app should do

This is a list of features that the app should implement. Some are already implemented, and some are not. The status of
the implementation of a feature is noted in that feature's entry.

- implement Gilles Castel's scripts in a CLI
  - his original scripts can be found in the [legacy scripts](legacy-scripts) folder
  - the implementation of this feature is largely complete, pending minor tweaks which will be decided later

- implements my addition to his scripts which adds management for homework assignments
  - can be found in the [legacy scripts](legacy-scripts) folder
  - the implementation of this feature is largely complete, pending minor tweaks which will be decided later

- has a config file which manages the ROOT directory for classes, and also a PROJECTS directory for projects, and also a github link for the github these should be linked to (the github should be optional)
  - the implementation of this feature is largely complete, pending minor tweaks which will be decided later (for example, additional things that must be saved in config)

- implements a GUI
  - the GUI exists and is largely functional, but is still a large work in progress

- has a "new semester" button which takes the user through a series of prompts to set up a new directory for a new semester (the refactored equivalent of running [`init-all-courses.py`](legacy-scripts/init-all-courses.py), but with dialogues for dynamic inputs)
  - implementation of this feature is our current goal
  - dialogues should include
    - what folder to put it in? (pops out a file selection dialogue, option to create a new folder)
    - what classes are you taking? (dialogue asking for course name, optional button to say youve added all courses)
    - for each course:
      - template to fill in `info.json`
      - should ask to create/use a preamble template for homeworks, can be declined
    - i am likely missing some things but this is all i can remember for now

- has a "new projects" button which takes the user through a series of prompts to set up a new project in the projects directory

- has a list of all active projects; clicking on oen of them opens a menu with some text, and allowing you to mark it as "artifacted/completed", making it clean up the project dir (rm aux files and the like), and remove it from the list of active projects. there can be a json consisting of all projects and marking them as active/completed, together with a short description

- has a list of all claseses in the current semester, along with the grade in that course; clicking on one of them opens a list of things you can do:

    - lectures: opens the lectures menu, implemented in rofi by castel's scripts

    - homeworks: opens the homeworks menu, implemented in the same way

    - grades: opens a menu allowing you to enter/modify grades

    - config: opens the config menu for editing

    - implementation of this feature is partially complete

- grades are implemented as follows: when a semester starts, part of the config file for that class implements a few types of assignments (user inputted), along with their weightings. The user then inputs assignments with point values in each specified class. Users should be able to specify "drop lowest grade" on any class of grades (this seems complex, lets not implement it for now)
  - this feature is not implemented and will be removed

- the current active course should be displayed
  - implemented

- the day's schedule should be displayed
  - implemented

- the homework schedule should be displayed
  - implemented

- the week's course schedule should be displayed
  - implemented

- a button to open a section with git operations; this has buttons to commit, push, commit & push, has a git log readout, and has the current status (2 commits ahead, 2 behind, etc)

- the app should log working time (time with a latex file in a course/proj directory open), and should log overall working time, per-project/class working time, and should have a stats display to display some nice stats
  - this feature will be removed

- there will be a lot of preamble files (to create modularity). there should be a button to define custom preambles from a collection of the preambles. 

## Current Progress

Currently, I have developed the config backends in `/src/config/*.js`, and most of the core class files, `Course`, `Courses`, `Lecture`, `Lectures`, `Homework`, `Homeworks`, `Countdown`, `InitAllCourses`, and `CompileAllMasters` in `/src/core/*.js` (most cloned from Gilles Castel's scripts). They work as follows:
- there are three config files, `config.json`, `logs.json`, and `preambles.json`. The first two are stored in the user's config dir, usually `CONFIG_DIR = ~/.config/LatexHub`, and the third is stored in the subdirectory `CONFIG_DIR/preambles`.
- `config.json` is the main config file. It tracks
  - `config.github_user`: the user's github username (i should really change this to the github link to the uni notes repository)
  - `config.current_semester`: the current semester
  - `config.root_dir`: the root directory for the current working directory (where the course directories are)
  - `config.projects_dir`: the projects directory (where each project's directory is)
  - `config.current_courses`: a list of all current courses
  - `config.archived_courses`: a list of all past/archived courses
  - `config.current_projects`: a list of all current projects
  - `config.archived_projects`: a list of all past/archived projects
- `preambles.json` tracks a collection of preamble snippets, and a collection of templates, which are also to be stored in `CONFIG_DIR/preambles`.
- preamble snippets are saved in the list `preambles.preambles`, and take the form
```json
{
  "file_name": "the file name, does not include the .tex file extension",
  "description": "a short description of the file",
  "tags": [
    "tags; these specify what kind of preamble snippet it is"
  ],
  "dependencies": [
    "does it depend on other preamble files? if so, their file_names go here"
  ]
}
```
- preamble templates are stored in the map `preambles.templates`, and take the form
```json
"template-name": [
  "a list of file_names from existing preamble snippet files, which combine to form the template"
]
```
- `logs.json` is a file which logs the user's activity. It logs each working session in `logs.work_sessions`, and the overall working time in each project/course (blanket term: workspace) in `logs.workspace_times`. The latter is simply a list of numbers, which represent the overall time spent working. The former saves "sessions", which are of the following form:
```json
{
  "id": "a unique id for each session",
  "start_time": "an iso formatted datetime representing session start",
  "end_time": "an iso formatted datetime representing session end",
  "context": "either \"course\" or \"project\"",
  "workspace": "the specific course/project name (as would be found in config.current_projects/courses) that was worked on"
}
```
- Course, Courses, Lecture, Lectures, Homework, Homeworks, and Countdown implement a lot of methods. For a full understanding of them, read the files themselves. CompileAllMasters and InitAllCourses are very simple and self explanatory. Read them for an understanding.
- A basic gui has been implemented. This is just a placeholder, and I am not currently working on it. Disregard it unless otherwise instructed.
- After completing the refactor of Gilles Castel's setup, I did a fully successful test deployment. One error that I am disregarding for now is that when called via WM hotkey, `Lectures.compileMaster()` doesn't work. Will fix later, ignore this for now.
- implemented a Library which works as an advanced citation manager. Integrates with a separate firefox extension allowing ArXiv articles to be added with a single click
  - this feature will later integrate with other parts of the enviroment via an advanced citation manager inside of nvim, allowing convenient addition of bibitems