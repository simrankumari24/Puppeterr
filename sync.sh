#!/bin/bash

# IMMORTAL MODE: never die on errors
set +e
trap '' INT
trap '' TERM     # ignore kill
trap '' HUP      # ignore terminal close
trap '' QUIT     # ignore Ctrl+\
trap '' TSTP     # ignore Ctrl+Z
# Hard-code the branch you care about
DEFAULT_BRANCH="fresh-brain"

echo "Using remote branch: $DEFAULT_BRANCH"

# Safe fetch (never kills script)
git fetch origin >/dev/null 2>&1 || echo "[warn] fetch failed, continuing..."

# Function: list missing files
list_missing() {
    echo "Missing files from origin/$DEFAULT_BRANCH:"
    local found=0

    # Safely list remote files
    while IFS= read -r file; do
        if [[ -z "$file" ]]; then
            continue
        fi
        if [[ ! -e "$file" ]]; then
            echo "- $file"
            found=1
        fi
    done < <(git ls-tree -r --name-only origin/$DEFAULT_BRANCH 2>/dev/null || echo "[warn] cannot list remote files")

    [[ $found -eq 0 ]] && echo "(none)"
}

# Function: view remote content of a missing file
view_file() {
    local file="$1"
    if [[ -z "$file" ]]; then
        echo "[error] You must specify a file name."
        return
    fi

    if [[ -e "$file" ]]; then
        echo "[info] File '$file' already exists locally."
        return
    fi

    echo "Remote content of '$file':"
    echo "--------------------------------------------"
    git show "origin/$DEFAULT_BRANCH:$file" 2>/dev/null || echo "[warn] cannot show file '$file' from remote."
    echo "--------------------------------------------"
}

# Function: pull a missing file
pull_file() {
    local file="$1"
    if [[ -z "$file" ]]; then
        echo "[error] You must specify a file name."
        return
    fi

    if [[ -e "$file" ]]; then
        echo "[info] File '$file' already exists locally. Skipping."
        return
    fi

    echo "Pulling '$file'..."
    git restore --source=origin/$DEFAULT_BRANCH -- "$file" 2>/dev/null || {
        echo "[warn] restore failed for '$file'."
        return
    }
    echo "Done."
}

# Function: pull all missing files
pull_all() {
    echo "Pulling all missing files..."
    local pulled=0

    while IFS= read -r file; do
        if [[ -z "$file" ]]; then
            continue
        fi
        if [[ ! -e "$file" ]]; then
            echo "Pulling $file..."
            git restore --source=origin/$DEFAULT_BRANCH -- "$file" 2>/dev/null || {
                echo "[warn] restore failed for '$file', continuing..."
                continue
            }
            pulled=1
        fi
    done < <(git ls-tree -r --name-only origin/$DEFAULT_BRANCH 2>/dev/null || echo "[warn] cannot list remote files")

    [[ $pulled -eq 0 ]] && echo "No missing files found."
    echo "Done."
}

# IMMORTAL main loop
while true; do
    echo
    echo "============================"
    echo "Commands:"
    echo "  list          - list missing files"
    echo "  view <file>   - show remote content of a missing file"
    echo "  pull <file>   - pull a missing file"
    echo "  pull-all      - pull all missing files"
    echo "  exit          - quit"
    echo "============================"
    read -rp "> " action arg

    case "$action" in
        list)      list_missing ;;
        view)      view_file "$arg" ;;
        pull)      pull_file "$arg" ;;
        pull-all)  pull_all ;;
        exit)      echo "Goodbye."; break ;;
        *)         echo "[error] Unknown command." ;;
    esac
done
