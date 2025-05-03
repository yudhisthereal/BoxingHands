import csv
import sys
import numpy as np
import matplotlib.pyplot as plt
from matplotlib.animation import FuncAnimation
from mpl_toolkits.mplot3d import Axes3D

# Load CSV
if len(sys.argv) < 2:
    print("Usage: python imu_visualizer.py <csv_filename>")
    sys.exit(1)

csv_file = sys.argv[1]
data = []

with open(csv_file, newline='') as f:
    reader = csv.reader(f)
    next(reader)  # skip header
    for row in reader:
        if len(row) == 6:
            data.append([float(v) for v in row])

acc_data = np.array(data)[:, 0:3]  # ax, ay, az

# Normalize vectors for display
def normalize(v):
    norm = np.linalg.norm(v)
    return v if norm == 0 else v / norm

# Setup 3D plot
fig = plt.figure()
ax = fig.add_subplot(111, projection='3d')
quiver = None

# Posisi & kecepatan awal
position = np.array([0.0, 0.0, 0.0])
velocity = np.array([0.0, 0.0, 0.0])
trail_line = None
trail = []

# Estimasi posisi untuk hitung jangkauan
velocity_tmp = np.array([0.0, 0.0, 0.0])
position_tmp = np.array([0.0, 0.0, 0.0])
positions = [position_tmp.copy()]

for acc in acc_data:
    velocity_tmp += acc
    position_tmp += velocity_tmp
    positions.append(position_tmp.copy())

positions = np.array(positions)
x_min, x_max = positions[:,0].min(), positions[:,0].max()
y_min, y_max = positions[:,1].min(), positions[:,1].max()
z_min, z_max = positions[:,2].min(), positions[:,2].max()

margin = 10
ax.set_xlim([x_min - margin, x_max + margin])
ax.set_ylim([y_min - margin, y_max + margin])
ax.set_zlim([z_min - margin, z_max + margin])

ax.set_xlabel("X")
ax.set_ylabel("Y")
ax.set_zlabel("Z")
ax.set_title("IMU Accelerometer Vector (Direction)")

def update(frame):
    global quiver, trail_line, position, velocity, trail

    if quiver:
        quiver.remove()
    if trail_line:
        trail_line.remove()

    acc = acc_data[frame]
    dt = 1  # anggap interval = 1 untuk simpel

    # Update velocity dan posisi
    velocity += acc * dt
    position += velocity * dt

    # Tambahkan ke trail
    trail.append(position.copy())
    if len(trail) > 500:  # batas panjang jejak
        trail.pop(0)

    # Gambar arah panah dari posisi sekarang
    direction = normalize(velocity)
    quiver = ax.quiver(
        position[0], position[1], position[2],
        direction[0], direction[1], direction[2],
        color='r'
    )

    # Gambar trail sebagai garis
    trail_np = np.array(trail)
    trail_line = ax.plot3D(trail_np[:,0], trail_np[:,1], trail_np[:,2], 'b')[0]

    return quiver, trail_line

ani = FuncAnimation(fig, update, frames=len(acc_data), interval=50, blit=False)

mp4_file = f"video/{csv_file[4:-5]}.mp4"
ani.save(mp4_file, writer="ffmpeg")
print(f"Animasi disimpan sebagai {mp4_file}")
