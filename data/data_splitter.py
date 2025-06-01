import csv
import os

def split_csv(input_file, sequence_length, gap=1, output_dir='filtered_data', filename_prefix='chunk_'):
    # Create output directory if it doesn't exist
    os.makedirs(output_dir, exist_ok=True)

    # Determine starting index based on existing files in the output directory
    existing_files = [f for f in os.listdir(output_dir) if f.startswith(filename_prefix) and f.endswith('.csv')]
    starting_index = len(existing_files) + 1

    # Read the input CSV file
    with open(input_file, 'r', newline='') as csvfile:
        reader = list(csv.reader(csvfile))
        header = reader[0]    # assuming the first row is the header
        rows = reader[1:]

        total_rows = len(rows)
        chunk_index = starting_index
        i = 0

        while i + sequence_length <= total_rows:
            chunk = rows[i:i+sequence_length]
            output_file = os.path.join(output_dir, f'{filename_prefix}{chunk_index}.csv')
            with open(output_file, 'w', newline='') as outcsv:
                writer = csv.writer(outcsv)
                writer.writerow(header)
                writer.writerows(chunk)
            print(f"Saved {output_file}")

            i += gap
            chunk_index += 1

# Interactive input
def main():
    print("=== Interactive CSV Splitter ===")
    input_file = input("Enter the path to the input CSV file: ").strip()
    while not os.path.isfile(input_file):
        print("❌ File not found. Try again.")
        input_file = input("Enter the path to the input CSV file: ").strip()

    output_dir = input("Enter the output directory (default: filtered_data): ").strip()
    if not output_dir:
        output_dir = "filtered_data"

    filename_prefix = input("Enter the output file prefix (e.g., imu_right_no_punch_): ").strip()
    if not filename_prefix:
        filename_prefix = "chunk_"

    try:
        sequence_length = int(input("Enter the sequence length (e.g., 15): "))
        gap = int(input("Enter the gap/stride (e.g., 10): "))
    except ValueError:
        print("⚠️ Invalid number entered. Using defaults (sequence_length=15, gap=10)")
        sequence_length = 15
        gap = 10

    split_csv(input_file, sequence_length, gap, output_dir, filename_prefix)

if __name__ == "__main__":
    main()
