#!/bin/bash

# Prompt user for the directory containing CSV files
read -rp "Enter the directory path containing the CSV files: " dir

# Check if the directory exists
if [[ ! -d "$dir" ]]; then
    echo "Directory does not exist. Exiting."
    exit 1
fi

# Go to the directory
cd "$dir" || exit

# Start renaming
i=1
for file in *_*.csv; do
    # Skip if no matching files
    [[ -e "$file" ]] || { echo "No matching files found."; break; }

    base=$(echo "$file" | sed -E 's/_[0-9]+\.csv$//')
    newname="${base}_${i}.csv"

    # Show renaming step
    echo "Renaming $file → $newname"
    mv "$file" "$newname"
    ((i++))
done
