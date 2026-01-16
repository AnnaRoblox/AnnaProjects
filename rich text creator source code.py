# source code
import tkinter as tk
from tkinter import scrolledtext, messagebox
import random

# Helper function to generate a random hex color
def get_random_hex_color():
    # Generates a random number up to FFFFFF and formats it as a 6-digit hex string
    return "#%06x" % random.randint(0, 0xFFFFFF)

def transform_text():
    # Grab input text
    input_val = input_box.get("1.0", "end-1c")
    
    # Get user settings
    selected_tag = tag_entry.get().strip()
    fixed_color = color_entry.get().strip()
    selected_size = size_entry.get().strip()
    is_random_color = random_color_var.get()
    
    output_chars = []
    
    for char in input_val:
        # We only apply styles to actual letters/numbers to keep layout cleaner
        # (You can remove this 'if' condition to wrap spaces/symbols too)
        if char.isalnum():
            styled_char = char
            
            # 1. Apply the structural tag (e.g., <dd> or <b>)
            if selected_tag:
                styled_char = f"<{selected_tag}>{styled_char}</{selected_tag}>"
            
            # 2. Determine the color for this specific character
            effective_color = None
            if is_random_color:
                effective_color = get_random_hex_color()
            elif fixed_color:
                effective_color = fixed_color
            
            # 3. Apply font attributes (Color and Size combined)
            if effective_color or selected_size:
                font_tag = '<font'
                if effective_color:
                    font_tag += f' color="{effective_color}"'
                if selected_size:
                    font_tag += f' size="{selected_size}"'
                font_tag += '>'
                
                styled_char = f'{font_tag}{styled_char}</font>'
                
            output_chars.append(styled_char)
        else:
            # Append non-alphanumeric characters as they are
            output_chars.append(char)
            
    final_text = "".join(output_chars)
    
    # Update the Dark Mode Output Box
    output_box.config(state=tk.NORMAL)
    output_box.delete("1.0", tk.END)
    output_box.insert("1.0", final_text)
    output_box.config(state=tk.DISABLED)

def copy_to_clipboard():
    text_to_copy = output_box.get("1.0", "end-1c")
    if text_to_copy:
        root.clipboard_clear()
        root.clipboard_append(text_to_copy)
        messagebox.showinfo("Success", "Copied to clipboard!")
    else:
        messagebox.showwarning("Empty", "Nothing to copy yet!")

# --- UI Setup ---
root = tk.Tk()
root.title("Advanced Rich Text Wrapper + Randomizer")
root.geometry("600x850") # Increased height slightly for the new checkbox
root.configure(padx=20, pady=20)

# Input Section
tk.Label(root, text="Step 1: Type your text here:", font=("Arial", 10, "bold")).pack(anchor="w")
input_box = scrolledtext.ScrolledText(root, height=6, width=60, font=("Arial", 10))
input_box.pack(pady=10)

# Settings Frame
settings_frame = tk.LabelFrame(root, text=" Step 2: Customization Options ", padx=10, pady=10)
settings_frame.pack(fill="x", pady=10)

# Tag Option (Row 0)
tk.Label(settings_frame, text="Tag (e.g., 'b', 'i', 'u'):").grid(row=0, column=0, sticky="w", pady=2)
tag_entry = tk.Entry(settings_frame)
tag_entry.insert(0, "b")
tag_entry.grid(row=0, column=1, padx=10, pady=2, sticky="w")

# Color Option (Row 1)
tk.Label(settings_frame, text="Fixed Color (e.g., 'red'):").grid(row=1, column=0, sticky="w", pady=2)
color_entry = tk.Entry(settings_frame)
color_entry.grid(row=1, column=1, padx=10, pady=2, sticky="w")
tk.Label(settings_frame, text="(Ignored if random is checked)", fg="gray", font=("Arial", 8)).grid(row=1, column=2, sticky="w")

# Random Color Toggle (Row 2) - NEW!
random_color_var = tk.BooleanVar()
random_check = tk.Checkbutton(settings_frame, text="🌈 Randomize Colors per letter", variable=random_color_var, font=("Arial", 10, "bold"))
random_check.grid(row=2, column=0, columnspan=2, sticky="w", pady=(5, 10))
random_check.select() # Default to checked because it's fun

# Size Option (Row 3)
tk.Label(settings_frame, text="Font Size (e.g., '4', '15px'):").grid(row=3, column=0, sticky="w", pady=2)
size_entry = tk.Entry(settings_frame)
size_entry.insert(0, "4")
size_entry.grid(row=3, column=1, padx=10, pady=2, sticky="w")

# Transform Button
btn = tk.Button(root, text="Generate Rich Text Code", command=transform_text, 
                bg="#673AB7", fg="white", font=("Arial", 10, "bold"), # Changed button color to match the "fun" theme
                pady=10, cursor="hand2")
btn.pack(pady=5, fill="x")

# Output Section
tk.Label(root, text="Step 3: Copy Result (Dark Mode):", font=("Arial", 10, "bold")).pack(anchor="w", pady=(10, 0))
output_box = scrolledtext.ScrolledText(
    root, 
    height=12, 
    width=60, 
    state=tk.DISABLED, 
    bg="#1e1e1e",    
    fg="#ffffff",    
    insertbackground="white",
    font=("Consolas", 10) 
)
output_box.pack(pady=10)

# Copy Button
copy_btn = tk.Button(root, text="📋 Copy All to Clipboard", command=copy_to_clipboard,
                     bg="#2196F3", fg="white", font=("Arial", 10), 
                     pady=8, cursor="hand2")
copy_btn.pack(pady=5, fill="x")

root.mainloop()
