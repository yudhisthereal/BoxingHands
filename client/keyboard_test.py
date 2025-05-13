import keyboard

print("Press 1, 2, 3, 4 or SPACE...")

while True:
    for key in ['1', '2', '3', '4', 'space']:
        if keyboard.is_pressed(key):
            print(f"Key '{key}' pressed.")
            while keyboard.is_pressed(key):
                pass  # Debounce
