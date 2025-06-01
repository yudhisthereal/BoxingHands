import os
import pandas as pd
import matplotlib.pyplot as plt
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

class IMUViewer:
    def __init__(self, root):
        self.root = root
        self.root.title("6-DOF IMU Data Viewer")

        self.df = None
        self.current_file_path = None
        self.csv_files = []
        self.current_index = -1

        # State variables
        self.viewmode = tk.StringVar(value="All")
        self.chunk_size = tk.IntVar(value=60)
        self.chunk_start = 0

        # File info label
        self.filename_label = tk.Label(root, text="No file loaded", fg="blue")
        self.filename_label.pack()

        # Button panel
        button_frame = tk.Frame(root)
        button_frame.pack(pady=10)

        self.load_button = tk.Button(button_frame, text="Load CSV", command=self.load_file)
        self.load_button.pack(side=tk.LEFT, padx=5)

        self.reload_button = tk.Button(button_frame, text="Reload", command=self.reload_file)
        self.reload_button.pack(side=tk.LEFT, padx=5)

        self.prev_button = tk.Button(button_frame, text="Prev", command=self.load_prev_file)
        self.prev_button.pack(side=tk.LEFT, padx=5)

        self.next_button = tk.Button(button_frame, text="Next", command=self.load_next_file)
        self.next_button.pack(side=tk.LEFT, padx=5)

        # Viewmode controls
        control_frame = tk.Frame(root)
        control_frame.pack(pady=5)

        tk.Label(control_frame, text="Viewmode:").pack(side=tk.LEFT)
        ttk.OptionMenu(control_frame, self.viewmode, "All", "All", "Chunk", command=self.update_view).pack(side=tk.LEFT, padx=5)

        tk.Label(control_frame, text="Chunk size:").pack(side=tk.LEFT)
        tk.Entry(control_frame, textvariable=self.chunk_size, width=5).pack(side=tk.LEFT, padx=5)

        # Navigation buttons (for chunk mode)
        self.nav_frame = tk.Frame(root)
        self.nav_buttons = []

        for text, cmd in [
            ("<< Skip Back", self.skip_backward),
            ("< Back", self.step_backward),
            ("Forward >", self.step_forward),
            ("Skip >>", self.skip_forward)
        ]:
            b = tk.Button(self.nav_frame, text=text, command=cmd)
            b.pack(side=tk.LEFT, padx=5)
            self.nav_buttons.append(b)

        # Save chunk controls
        self.save_frame = tk.Frame(root)
        self.label_type = tk.StringVar(value="jab")
        ttk.OptionMenu(self.save_frame, self.label_type, "jab", "jab", "hook", "straight", "uppercut").pack(side=tk.LEFT, padx=5)
        tk.Button(self.save_frame, text="Save Chunk", command=self.save_chunk).pack(side=tk.LEFT, padx=5)

        # Matplotlib figure and axes
        self.fig, (self.ax1, self.ax2) = plt.subplots(2, 1, figsize=(8, 6), sharex=True)
        self.ax1.set_title("Accelerometer")
        self.ax1.set_ylabel("Acceleration (g)")
        self.ax1.grid(True)

        self.ax2.set_title("Gyroscope")
        self.ax2.set_ylabel("Angular Velocity (°/s)")
        self.ax2.set_xlabel("Sample Index")
        self.ax2.grid(True)

        self.fig.tight_layout()
        self.canvas = FigureCanvasTkAgg(self.fig, master=root)
        self.canvas.draw()
        self.canvas.get_tk_widget().pack()

    def load_file(self):
        file_path = filedialog.askopenfilename(filetypes=[("CSV files", "*.csv")], title="Select IMU CSV File")
        if file_path:
            self.set_file_list(file_path)
            self.load_and_plot(file_path)

    def reload_file(self):
        if self.current_file_path:
            self.load_and_plot(self.current_file_path)
        else:
            messagebox.showinfo("Info", "No file loaded to reload.")

    def load_next_file(self):
        if self.csv_files and self.current_index < len(self.csv_files) - 1:
            self.current_index += 1
            self.load_and_plot(self.csv_files[self.current_index])

    def load_prev_file(self):
        if self.csv_files and self.current_index > 0:
            self.current_index -= 1
            self.load_and_plot(self.csv_files[self.current_index])

    def set_file_list(self, selected_file):
        folder = os.path.dirname(selected_file)
        self.csv_files = sorted([
            os.path.join(folder, f)
            for f in os.listdir(folder)
            if f.lower().endswith(".csv")
        ])
        self.current_index = self.csv_files.index(selected_file)

    def update_view(self, *_):
        if self.viewmode.get() == "Chunk":
            self.nav_frame.pack(pady=5)
            self.save_frame.pack(pady=5)
        else:
            self.nav_frame.forget()
            self.save_frame.forget()
        self.plot_current()

    def load_and_plot(self, file_path):
        try:
            df = pd.read_csv(file_path)
            required = ['ax', 'ay', 'az', 'gx', 'gy', 'gz']
            if not all(col in df.columns for col in required):
                raise ValueError("Missing required columns: ax, ay, az, gx, gy, gz")
            self.df = df
            self.current_file_path = file_path
            self.chunk_start = 0
            self.filename_label.config(text=f"Loaded: {os.path.basename(file_path)}")
            self.plot_current()
        except Exception as e:
            messagebox.showerror("Error", f"Failed to load file:\n{str(e)}")

    def plot_current(self):
        if self.df is None:
            return

        self.ax1.cla()
        self.ax2.cla()

        if self.viewmode.get() == "Chunk":
            start = self.chunk_start
            end = start + self.chunk_size.get()
            chunk = self.df.iloc[start:end]
        else:
            chunk = self.df

        x = chunk.index
        self.ax1.plot(x, chunk['ax'], label='ax')
        self.ax1.plot(x, chunk['ay'], label='ay')
        self.ax1.plot(x, chunk['az'], label='az')
        self.ax1.set_title("Accelerometer")
        self.ax1.set_ylabel("Acceleration (g)")
        self.ax1.legend()
        self.ax1.grid(True)

        self.ax2.plot(x, chunk['gx'], label='gx')
        self.ax2.plot(x, chunk['gy'], label='gy')
        self.ax2.plot(x, chunk['gz'], label='gz')
        self.ax2.set_title("Gyroscope")
        self.ax2.set_ylabel("Angular Velocity (°/s)")
        self.ax2.set_xlabel("Sample Index")
        self.ax2.legend()
        self.ax2.grid(True)

        self.fig.tight_layout()
        self.canvas.draw()

    # Navigation
    def step_forward(self):
        self.chunk_start += 1
        self.plot_current()

    def step_backward(self):
        self.chunk_start = max(0, self.chunk_start - 1)
        self.plot_current()

    def skip_forward(self):
        self.chunk_start += self.chunk_size.get()
        self.plot_current()

    def skip_backward(self):
        self.chunk_start = max(0, self.chunk_start - self.chunk_size.get())
        self.plot_current()

    def save_chunk(self):
        if self.df is None or self.viewmode.get() != "Chunk":
            messagebox.showinfo("Info", "No chunk to save.")
            return

        start = self.chunk_start
        end = start + self.chunk_size.get()
        chunk = self.df.iloc[start:end]

        label = self.label_type.get()
        save_folder = os.path.join("labeled_chunks", label)
        os.makedirs(save_folder, exist_ok=True)

        base_name = os.path.splitext(os.path.basename(self.current_file_path))[0]
        index = len(os.listdir(save_folder))
        save_path = os.path.join(save_folder, f"{base_name}_{index}.csv")

        chunk.to_csv(save_path, index=False)
        messagebox.showinfo("Saved", f"Saved chunk to:\n{save_path}")

if __name__ == "__main__":
    root = tk.Tk()
    app = IMUViewer(root)
    root.mainloop()
