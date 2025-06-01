import os
import csv

def get_csv_files(directory):
    return [f for f in os.listdir(directory) if f.endswith(".csv") and os.path.isfile(os.path.join(directory, f))]

def count_rows(filepath):
    with open(filepath, 'r', newline='') as f:
        return len(list(csv.reader(f))) - 1  # exclude header

def trim_csv(input_path, output_path, max_rows):
    with open(input_path, 'r', newline='') as infile:
        reader = list(csv.reader(infile))
        header = reader[0]
        rows = reader[1:max_rows+1]

    with open(output_path, 'w', newline='') as outfile:
        writer = csv.writer(outfile)
        writer.writerow(header)
        writer.writerows(rows)

def prompt_input(prompt, default_value):
    value = input(f"{prompt} [{default_value}]: ").strip()
    return value if value else default_value

def main():
    print("=== 🔁 CSV Batch Trimmer (Repeatable) ===")
    prev_input_dir = "data"
    prev_output_dir = "trimmed"
    prev_sequence_length = 15

    while True:
        input_dir = prompt_input("Enter input directory containing CSV files", prev_input_dir)
        while not os.path.isdir(input_dir):
            print("❌ Invalid directory. Try again.")
            input_dir = input("Enter input directory: ").strip()

        csv_files = get_csv_files(input_dir)
        if not csv_files:
            print("⚠️ No CSV files found in the directory.")
            continue

        print("\n📊 File row counts:")
        file_lengths = {}
        for f in csv_files:
            full_path = os.path.join(input_dir, f)
            row_count = count_rows(full_path)
            file_lengths[f] = row_count
            print(f"{f}: {row_count} rows")

        min_len = min(file_lengths.values())
        print(f"\n🔍 Minimum sequence length across files: {min_len}")

        try:
            new_len_input = prompt_input(f"Enter new shorter sequence length (≤ {min_len})", str(prev_sequence_length))
            new_len = int(new_len_input)
            if new_len > min_len or new_len <= 0:
                raise ValueError
        except ValueError:
            print("❌ Invalid input. Try again.")
            continue

        output_dir = prompt_input("Enter output directory to save trimmed files", prev_output_dir)
        os.makedirs(output_dir, exist_ok=True)

        print("\n✂️ Trimming and saving files...")
        for f in csv_files:
            in_path = os.path.join(input_dir, f)
            out_path = os.path.join(output_dir, f)
            trim_csv(in_path, out_path, new_len)
            print(f"✅ Saved: {out_path}")

        # Save previous inputs
        prev_input_dir = input_dir
        prev_output_dir = output_dir
        prev_sequence_length = new_len

        again = input("\n🔁 Do you want to process another batch? (Y/n): ").strip().lower()
        if again == 'n':
            print("👋 Exiting.")
            break
        print("\n--- Restarting ---\n")

if __name__ == "__main__":
    main()
