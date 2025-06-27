# LaTeX Hub
An app for managing university course files and LaTeX heavy projects. Comes with a GUI solution, written using gjs and GTK widgets; and a CLI solution
for integration into hotkey daemons (as paired with WMs) for quick access to rofi menus, and the like.

What the app should do:

- implements gilles castel's scripts in a CLI (the python versions can already be found in this repo under Legacy Scripts, most are also already rewritten in js);

- implements my addition to his scripts which adds management for homework assignments (again, as a cli)

- has a config file which manages the ROOT directory for classes, and also a PROJECTS directory for projects, and also a github link for the github these should be linked to (the github should be optional)

- has a "new semester" button which takes the user through a series of prompts to set up a new directory for a new semester

- has a "new projects" button which takes the user through a series of prompts to set up a new project in the projects directory

- has a list of all active projects; clicking on oen of them opens a menu with some text, and allowing you to mark it as "artifacted/completed", making it clean up the project dir (rm aux files and the like), and remove it from the list of active projects. there can be a json consisting of all projects and marking them as active/completed, together with a short description

- has a list of all claseses in the current semester, along with the grade in that course; clicking on one of them opens a list of things you can do:

    - lectures: opens the lectures menu, implemented in rofi by castel's scripts

    - homeworks: opens the homeworks menu, implemented in the same way

    - grades: opens a menu allowing you to enter/modify grades

    - config: opens the config menu for editing

- grades are implemented as follows: when a semester starts, part of the config file for that class implements a few types of assignments (user inputted), along with their weightings. The user then inputs assignments with point values in each specified class. Users should be able to specify "drop lowest grade" on any class of grades (this seems complex, lets not implement it for now)

- the current active course should be displayed

- the day's schedule should be displayed

- the homework schedule should be displayed

- the week's course schedule should be displayed

- a button to open a section with git operations; this has buttons to commit, push, commit & push, has a git log readout, and has the current status (2 commits ahead, 2 behind, etc)

- the app should log working time (time with a latex file in a course/proj directory open), and should log overall working time, per-project/class working time, and should have a stats display to display some nice stats

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

Currently, I need to make some modifications to some of the structure before I can deploy the current version of the project for a full test run. The biggest issue is that when the LaTeX template code is pasted for homeworks and lecture notes (master files for courses), the preamble file has to be hardcoded. This kind of defeats the point of modularity of preambles. here are my ideas:
- for lecture notes, the preamble should be set on creation. This means InitAllCourses needs to query the user for what preambles to include. In the future, this will be managed via GUI and the user will be able to select the files, but for now we're not going to work in a gui, we are working in a terminal, simply as proof of concept. The program should send a list of all available preamble file names, together with their description. The user should send a list of preamble file names to be used. The program is allowed to require specific formatting to make it easier to parse, since this is only proof of concept and not being pushed to production. The program should also print a list of templates together with each list of preambles they include, and if the user includes a template in their list the program should input all preambles in the template
- for homeworks, the info.json for each course should save a list of preamble file_names, and that list should become the preamble files for homeworks.