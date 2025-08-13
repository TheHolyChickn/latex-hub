import subprocess

def rofi(prompt, options, wofi_args=[], fuzzy=True):
    option_str = '\n'.join(option.replace('\n', ' ') for option in options)
    args = ['rofi']
    if fuzzy:
        args += ['-matching', 'fuzzy']
    args += ['-dmenu', '-p', prompt, '-f', 's', '-i']
    args += wofi_args
    args = [str(arg) for arg in args]


    result = subprocess.run(
            args,
            input=option_str,
            stdout=subprocess.PIPE,
            universal_newlines=True
    )
    returncode = result.returncode
    stdout = result.stdout.strip()

    selected = stdout.strip()
    try:
        index = [opt.strip() for opt in options].index(selected)
    except ValueError:
        index = -1

    if returncode == 0:
        key = 0
    elif returncode == 1:
        key = -1
    elif returncode > 9:
        key = returncode - 9

    return key, index, selected
