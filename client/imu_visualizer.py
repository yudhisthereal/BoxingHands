import csv
import sys
import numpy as np
import matplotlib.pyplot as plt
from matplotlib.animation import FuncAnimation
from tqdm import tqdm
from matplotlib.animation import FFMpegWriter

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

xy_line = None
yz_line = None
xz_line = None

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

from scipy.spatial.transform import Rotation as R

# Split accel and gyro data
acc_data = np.array(data)[:, 0:3]  # ax, ay, az
gyro_data = np.array(data)[:, 3:6]  # gx, gy, gz

# Orientation initial (identity quaternion)
orientation = R.from_quat([0, 0, 0, 1])  # x, y, z, w

# Compute scale factor for quiver arrow size
range_scale = max(x_max - x_min, y_max - y_min, z_max - z_min)
arrow_length = range_scale * 0.01  # 1% of the largest axis span


def update(frame):
    global quiver, trail_line, position, velocity, trail, orientation
    global xy_line, yz_line, xz_line

    # Remove old objects
    if quiver:
        quiver.remove()
    if trail_line:
        trail_line.remove()
    if xy_line:
        xy_line.remove()
    if yz_line:
        yz_line.remove()
    if xz_line:
        xz_line.remove()

    acc = acc_data[frame]
    gyro = gyro_data[frame]
    dt = 1

    # Orientation update
    angle = np.linalg.norm(gyro * dt)
    if angle != 0:
        axis = gyro / angle
        delta_rotation = R.from_rotvec(axis * angle)
        orientation = orientation * delta_rotation

    # Position update
    velocity += acc * dt
    position += velocity * dt
    trail.append(position.copy())

    # Orientation vectors
    forward = normalize(orientation.apply([0, 0, 1]))  # Z+
    right = normalize(orientation.apply([1, 0, 0]))    # X+
    up = normalize(orientation.apply([0, 1, 0]))       # Y+

    # Draw heading arrow (quiver)
    quiver = ax.quiver(
        position[0], position[1], position[2],
        forward[0], forward[1], forward[2],
        color='g', length=arrow_length
    )

    # Plane line length
    plane_len = arrow_length * 2

    # Draw animated planes
    xy_start = position - right * plane_len / 2 - up * plane_len / 2
    xy_end_x = xy_start + right * plane_len
    xy_end_y = xy_start + up * plane_len
    xy_line = ax.plot3D(
        [xy_start[0], xy_end_x[0]], [xy_start[1], xy_end_x[1]], [xy_start[2], xy_end_x[2]],
        'r'
    )[0]
    ax.plot3D(
        [xy_start[0], xy_end_y[0]], [xy_start[1], xy_end_y[1]], [xy_start[2], xy_end_y[2]],
        'r'
    )

    yz_start = position - up * plane_len / 2 - forward * plane_len / 2
    yz_end_y = yz_start + up * plane_len
    yz_end_z = yz_start + forward * plane_len
    yz_line = ax.plot3D(
        [yz_start[0], yz_end_y[0]], [yz_start[1], yz_end_y[1]], [yz_start[2], yz_end_y[2]],
        'g'
    )[0]
    ax.plot3D(
        [yz_start[0], yz_end_z[0]], [yz_start[1], yz_end_z[1]], [yz_start[2], yz_end_z[2]],
        'g'
    )

    xz_start = position - right * plane_len / 2 - forward * plane_len / 2
    xz_end_x = xz_start + right * plane_len
    xz_end_z = xz_start + forward * plane_len
    xz_line = ax.plot3D(
        [xz_start[0], xz_end_x[0]], [xz_start[1], xz_end_x[1]], [xz_start[2], xz_end_x[2]],
        'b'
    )[0]
    ax.plot3D(
        [xz_start[0], xz_end_z[0]], [xz_start[1], xz_end_z[1]], [xz_start[2], xz_end_z[2]],
        'b'
    )

    # Trail
    trail_np = np.array(trail)
    trail_line = ax.plot3D(trail_np[:, 0], trail_np[:, 1], trail_np[:, 2], 'k')[0]

    return quiver, trail_line, xy_line, yz_line, xz_line


frames = len(acc_data)
ani = FuncAnimation(fig, update, frames=frames, interval=50, blit=False)

mp4_file = f"video/{csv_file[4:-5]}.mp4"
writer = FFMpegWriter(fps=20)
with writer.saving(fig, mp4_file, dpi=100):
    for i in tqdm(range(frames), desc="Rendering animation"):
        update(i)
        writer.grab_frame()
print(f"Animasi disimpan sebagai {mp4_file}")
