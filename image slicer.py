import tkinter as tk
from tkinter import filedialog, messagebox
from PIL import Image, ImageTk, ImageDraw
import os
import datetime
import math # Import the math module for floor and ceil

class ImagePartSelectorApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Image Part Selector")
        self.root.geometry("800x600") # Set initial window size

        self.original_image_path = None
        self.original_image = None # This will now be in RGBA mode
        self.tk_image = None # PhotoImage for Tkinter display
        self.image_on_canvas_id = None # Store the ID of the image item on the canvas
        self.selected_regions = [] # Stores (x1, y1, x2, y2) for each selection in ORIGINAL IMAGE coordinates

        self.start_x = None
        self.start_y = None
        self.current_rectangle_id = None

        self._create_widgets()

    def _create_widgets(self):
        # Frame for buttons
        button_frame = tk.Frame(self.root)
        button_frame.pack(pady=10)

        self.select_image_btn = tk.Button(button_frame, text="Select Image", command=self._select_image)
        self.select_image_btn.pack(side=tk.LEFT, padx=5)

        self.clear_selections_btn = tk.Button(button_frame, text="Clear Selections", command=self._clear_selections)
        self.clear_selections_btn.pack(side=tk.LEFT, padx=5)
        self.clear_selections_btn.config(state=tk.DISABLED) # Disable until image is loaded

        self.process_save_btn = tk.Button(button_frame, text="Process and Save", command=self._process_and_save)
        self.process_save_btn.pack(side=tk.LEFT, padx=5)
        self.process_save_btn.config(state=tk.DISABLED) # Disable until image is loaded

        # Canvas for image display and selection
        self.canvas = tk.Canvas(self.root, bg="lightgray", bd=2, relief=tk.SUNKEN)
        self.canvas.pack(fill=tk.BOTH, expand=True)

        # Bind mouse events for drawing rectangles
        self.canvas.bind("<Button-1>", self._on_mouse_down)
        self.canvas.bind("<B1-Motion>", self._on_mouse_drag)
        self.canvas.bind("<ButtonRelease-1>", self._on_mouse_up)

        # Status Label
        self.status_label = tk.Label(self.root, text="Please select an image.", bd=1, relief=tk.SUNKEN, anchor=tk.W)
        self.status_label.pack(side=tk.BOTTOM, fill=tk.X, ipady=2)

    def _select_image(self):
        """Opens a file dialog to select an image and displays it on the canvas."""
        file_path = filedialog.askopenfilename(
            title="Select an Image File",
            filetypes=[("Image Files", "*.png;*.jpg;*.jpeg;*.gif;*.bmp")]
        )
        if file_path:
            self.original_image_path = file_path
            try:
                # Open the image using PIL and convert to RGBA for transparency support
                self.original_image = Image.open(self.original_image_path).convert("RGBA")

                # Clear previous canvas content and selections
                self.canvas.delete("all")
                self.selected_regions = [] # Reset selected regions for new image
                self.image_on_canvas_id = None # Reset image ID

                # Force canvas to update its size based on its pack/grid settings
                self.root.update_idletasks() 
                canvas_width = self.canvas.winfo_width()
                canvas_height = self.canvas.winfo_height()

                # Calculate aspect ratios and determine how to scale the image
                img_aspect = self.original_image.width / self.original_image.height
                canvas_aspect = canvas_width / canvas_height

                if img_aspect > canvas_aspect:
                    # Image is wider relative to its height than the canvas
                    new_width = canvas_width
                    new_height = int(canvas_width / img_aspect)
                else:
                    # Image is taller relative to its width than the canvas, or aspect is similar
                    new_height = canvas_height
                    new_width = int(canvas_height * img_aspect)

                # Resize image using LANCZOS for quality and convert to PhotoImage
                # Note: Tkinter's PhotoImage might not render transparency perfectly on display
                # but PIL's Image operations will respect it for saving.
                resized_image = self.original_image.copy()
                resized_image.thumbnail((new_width, new_height), Image.Resampling.LANCZOS)
                self.tk_image = ImageTk.PhotoImage(resized_image)

                # Display the image, centered on the canvas, and store its ID
                x_center = canvas_width / 2
                y_center = canvas_height / 2
                self.image_on_canvas_id = self.canvas.create_image(x_center, y_center, image=self.tk_image, anchor=tk.CENTER)

                self.status_label.config(text=f"Image loaded: {os.path.basename(file_path)}. Click and drag to select parts.")
                self.clear_selections_btn.config(state=tk.NORMAL)
                self.process_save_btn.config(state=tk.NORMAL)

            except Exception as e:
                messagebox.showerror("Error", f"Could not open image: {e}")
                self.original_image_path = None
                self.original_image = None
                self.tk_image = None
                self.canvas.delete("all")
                self.image_on_canvas_id = None
                self.status_label.config(text="Failed to load image. Please select another.")
                self.clear_selections_btn.config(state=tk.DISABLED)
                self.process_save_btn.config(state=tk.DISABLED)

    def _on_mouse_down(self, event):
        """Starts drawing a rectangle when mouse button 1 is pressed."""
        if self.original_image and self.image_on_canvas_id:
            # Get the bounding box of the displayed image on the canvas
            img_bbox = self.canvas.bbox(self.image_on_canvas_id)
            if not img_bbox: return # Should not happen if image_on_canvas_id exists

            # Clamp the starting coordinates to be within the image display bounds
            self.start_x = max(img_bbox[0], min(event.x, img_bbox[2]))
            self.start_y = max(img_bbox[1], min(event.y, img_bbox[3]))

            # Delete any previous temporary rectangle if exists
            if self.current_rectangle_id:
                self.canvas.delete(self.current_rectangle_id)
            # Create a new rectangle (initially 0 size)
            self.current_rectangle_id = self.canvas.create_rectangle(
                self.start_x, self.start_y, self.start_x, self.start_y,
                outline="red", width=2, dash=(5, 2)
            )
        else:
            self.status_label.config(text="Click inside the image to start selection.")
            self.start_x = None # Reset start_x, start_y if click is outside image
            self.start_y = None
                
    def _on_mouse_drag(self, event):
        """Updates the rectangle as the mouse is dragged."""
        if self.original_image and self.current_rectangle_id and self.start_x is not None:
            # Get the bounding box of the displayed image on the canvas
            img_bbox = self.canvas.bbox(self.image_on_canvas_id)
            if not img_bbox: return # Should not happen if image_on_canvas_id exists

            # Clamp the current mouse position to be within the image display bounds
            current_x = max(img_bbox[0], min(event.x, img_bbox[2]))
            current_y = max(img_bbox[1], min(event.y, img_bbox[3]))

            # Update the rectangle's coordinates
            self.canvas.coords(self.current_rectangle_id, self.start_x, self.start_y, current_x, current_y)

    def _on_mouse_up(self, event):
        """Finalizes the rectangle when mouse button 1 is released."""
        if not self.original_image or not self.image_on_canvas_id or self.start_x is None:
            self.status_label.config(text="Please load an image and click within it to select.")
            if self.current_rectangle_id:
                self.canvas.delete(self.current_rectangle_id)
            self.current_rectangle_id = None
            return

        # Clamp the ending coordinates to be within the image display bounds
        img_bbox = self.canvas.bbox(self.image_on_canvas_id)
        if not img_bbox:
            self.status_label.config(text="Error: Could not determine image position on canvas.")
            self.canvas.delete(self.current_rectangle_id)
            self.current_rectangle_id = None
            return

        end_x = max(img_bbox[0], min(event.x, img_bbox[2]))
        end_y = max(img_bbox[1], min(event.y, img_bbox[3]))

        # Calculate normalized start and end points relative to the image's top-left on the canvas
        # These will be non-negative and within the displayed image's dimensions.
        norm_x1_canvas_clamped = min(self.start_x, end_x) - img_bbox[0]
        norm_y1_canvas_clamped = min(self.start_y, end_y) - img_bbox[1]
        norm_x2_canvas_clamped = max(self.start_x, end_x) - img_bbox[0]
        norm_y2_canvas_clamped = max(self.start_y, end_y) - img_bbox[1]

        original_img_width, original_img_height = self.original_image.size
        img_display_width = img_bbox[2] - img_bbox[0]
        img_display_height = img_bbox[3] - img_bbox[1]

        if img_display_width <= 0 or img_display_height <= 0:
            self.status_label.config(text="Displayed image dimensions are invalid. Cannot select.")
            self.canvas.delete(self.current_rectangle_id)
            self.current_rectangle_id = None
            return

        # Calculate scaling factors
        scale_x = original_img_width / img_display_width
        scale_y = original_img_height / img_display_height

        # Convert to original image coordinates using math.floor for x1, y1
        # and math.ceil for x2, y2 to ensure we capture all pixels and avoid transparent edges.
        orig_x1 = int(math.floor(norm_x1_canvas_clamped * scale_x))
        orig_y1 = int(math.floor(norm_y1_canvas_clamped * scale_y))
        orig_x2 = int(math.ceil(norm_x2_canvas_clamped * scale_x))
        orig_y2 = int(math.ceil(norm_y2_canvas_clamped * scale_y))
        
        # Clamp the calculated original image coordinates to ensure they are strictly within
        # the bounds of the original image (0 to width-1 / 0 to height-1).
        orig_x1 = max(0, orig_x1)
        orig_y1 = max(0, orig_y1)
        orig_x2 = min(original_img_width, orig_x2)
        orig_y2 = min(original_img_height, orig_y2)

        # Ensure minimal selection size (check width/height directly now)
        # A 1x1 pixel selection is the smallest valid.
        if (orig_x2 - orig_x1) < 1 or (orig_y2 - orig_y1) < 1: 
            self.status_label.config(text="Selection too small. Please drag a larger area.")
            self.canvas.delete(self.current_rectangle_id)
            self.current_rectangle_id = None
            return

        self.selected_regions.append((orig_x1, orig_y1, orig_x2, orig_y2))

        # Redraw the rectangle on canvas permanently in a different color
        self.canvas.delete(self.current_rectangle_id) # Delete temporary
        
        # Draw the permanent rectangle using the actual canvas coordinates (clamped and normalized)
        # These are the coordinates that were actually visible and selected on the canvas
        self.canvas.create_rectangle(
            img_bbox[0] + norm_x1_canvas_clamped, img_bbox[1] + norm_y1_canvas_clamped,
            img_bbox[0] + norm_x2_canvas_clamped, img_bbox[1] + norm_y2_canvas_clamped,
            outline="blue", width=2
        ) 

        self.current_rectangle_id = None # Reset for next selection
        self.start_x = None # Reset mouse start coordinates
        self.start_y = None
        self.status_label.config(text=f"{len(self.selected_regions)} areas selected. Drag more or click 'Process and Save'.")


    def _clear_selections(self):
        """Clears all drawn rectangles and reset selection list."""
        if messagebox.askyesno("Clear Selections", "Are you sure you want to clear all selected areas?"):
            self.canvas.delete("all")
            if self.tk_image and self.image_on_canvas_id: # Redraw the original image if available
                # Restore the image on the canvas
                canvas_width = self.canvas.winfo_width()
                canvas_height = self.canvas.winfo_height()
                x_center = canvas_width / 2
                y_center = canvas_height / 2
                self.image_on_canvas_id = self.canvas.create_image(x_center, y_center, image=self.tk_image, anchor=tk.CENTER)
            self.selected_regions = []
            self.status_label.config(text="All selections cleared. Start new selections.")

    def _inpaint_transparent_regions(self, image_rgba, transparent_regions_coords, iterations=15):
        """
        Performs a basic iterative inpainting (color diffusion) on transparent regions.
        Fills transparent pixels by averaging colors of their surrounding opaque neighbors.
        """
        img = image_rgba.copy()
        width, height = img.size

        # Create the initial image with transparent holes where selections were
        # This is essentially the unselected_image before inpainting
        draw = ImageDraw.Draw(img)
        for x1, y1, x2, y2 in transparent_regions_coords:
            draw.rectangle([(x1, y1), (x2, y2)], fill=(0, 0, 0, 0)) # Fill with fully transparent

        # Perform iterative color diffusion
        for _ in range(iterations):
            pixels_read = img.load() # Get pixel access for reading from current state
            new_pixels_data = list(img.getdata()) # Copy all pixel data for writing new state efficiently

            for y in range(height):
                for x in range(width):
                    # Check if the current pixel is transparent (part of the "hole")
                    # We check the alpha value of the pixel from the 'pixels_read' (current state)
                    if pixels_read[x, y][3] == 0: 
                        r_sum, g_sum, b_sum, count = 0, 0, 0, 0
                        
                        # Check 3x3 neighbors (excluding itself)
                        for dy in [-1, 0, 1]:
                            for dx in [-1, 0, 1]:
                                if dx == 0 and dy == 0:
                                    continue # Skip self
                                
                                nx, ny = x + dx, y + dy
                                
                                # Check bounds and ensure neighbor is OPAQUE (has color content)
                                if 0 <= nx < width and 0 <= ny < height:
                                    neighbor_pixel = pixels_read[nx, ny]
                                    if neighbor_pixel[3] > 0: # If neighbor is opaque
                                        r_sum += neighbor_pixel[0]
                                        g_sum += neighbor_pixel[1]
                                        b_sum += neighbor_pixel[2]
                                        count += 1
                        
                        if count > 0:
                            # Average the colors of opaque neighbors
                            new_r = r_sum // count
                            new_g = g_sum // count
                            new_b = b_sum // count
                            # Set alpha to fully opaque (255) for the filled pixel
                            new_pixels_data[y * width + x] = (new_r, new_g, new_b, 255)
                        # else: If no opaque neighbors, it remains transparent for this iteration;
                        # it will be filled in a subsequent iteration as colors propagate.
                        # The data remains (0,0,0,0) in new_pixels_data if count is 0.
            
            # Update the image with the new pixel data for the next iteration
            img = Image.new("RGBA", (width, height))
            img.putdata(new_pixels_data) # putdata is much faster than putpixel
        
        return img

    def _feather_image_edges(self, image_rgba, feather_pixels=2):
        """
        Applies alpha feathering to the edges of an RGBA image.
        Makes pixels near the edges gradually fade to transparent.
        """
        img = image_rgba.copy()
        width, height = img.size
        pixels = img.load()

        # Create a new alpha channel
        new_alpha_data = [0] * (width * height)

        for y in range(height):
            for x in range(width):
                r, g, b, a = pixels[x, y]
                
                # If the pixel is already fully transparent, keep it that way
                if a == 0:
                    new_alpha_data[y * width + x] = 0
                    continue

                # Calculate distance to nearest edge
                dist_left = x
                dist_right = width - 1 - x
                dist_top = y
                dist_bottom = height - 1 - y

                min_dist_h = min(dist_left, dist_right)
                min_dist_v = min(dist_top, dist_bottom)

                # Find the smallest distance to any edge
                min_dist_to_edge = min(min_dist_h, min_dist_v)

                if min_dist_to_edge < feather_pixels:
                    # Calculate new alpha based on distance to edge
                    # Linear falloff: 0 at feather_pixels, 255 at 0
                    new_a = int(a * (min_dist_to_edge / feather_pixels))
                    new_alpha_data[y * width + x] = new_a
                else:
                    # Pixel is not within feathering zone, keep its original alpha
                    new_alpha_data[y * width + x] = a
        
        # Create a new image with the original RGB and the modified alpha
        feathered_image = Image.new("RGBA", (width, height))
        feathered_image.putdata([(pixels[i % width, i // width][0],
                                   pixels[i % width, i // width][1],
                                   pixels[i % width, i // width][2],
                                   new_alpha_data[i]) for i in range(width * height)])
        return feathered_image


    def _process_and_save(self):
        """Processes the selected regions and saves them along with the unselected area."""
        if not self.original_image:
            messagebox.showwarning("No Image", "Please select an image first.")
            return
        if not self.selected_regions:
            messagebox.showwarning("No Selections", "Please select at least one area on the image.")
            return

        # Define feathering radius for selected parts
        feather_radius = 2 # Adjust this value (e.g., 1, 3, 5) for desired softness

        # Create a new directory for the output
        base_name = os.path.splitext(os.path.basename(self.original_image_path))[0]
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        output_folder_name = f"{base_name}_parts_{timestamp}_feathered" # Indicate feathered output
        output_dir = os.path.join(os.path.dirname(self.original_image_path), output_folder_name)

        try:
            os.makedirs(output_dir, exist_ok=True)
            self.status_label.config(text=f"Saving images to: {output_dir}...")

            width, height = self.original_image.size

            # Process each selected region (cutouts with transparent backgrounds and feathered edges)
            for i, (x1, y1, x2, y2) in enumerate(self.selected_regions):
                # Create a new, fully transparent image of the original size (RGBA, (0,0,0,0))
                part_image = Image.new("RGBA", (width, height), (0, 0, 0, 0)) # R=0, G=0, B=0, A=0 (fully transparent)
                
                # Crop the specific selected region from the original RGBA image
                cropped_area = self.original_image.crop((x1, y1, x2, y2))
                
                # Apply feathering to the cropped area
                feathered_cropped_area = self._feather_image_edges(cropped_area, feather_pixels=feather_radius)
                
                # Paste the feathered cropped area onto the transparent background at its *original* position
                part_image.paste(feathered_cropped_area, (x1, y1))
                
                # Save the part image (PNG supports transparency)
                part_image_name = f"{base_name}_part_{i+1}.png"
                part_image_path = os.path.join(output_dir, part_image_name)
                part_image.save(part_image_path)
                print(f"Saved: {part_image_path}")

            # Process the unselected area (filled with surrounding pixels)
            # Use the inpainting function on a copy of the original image
            unselected_filled_image = self._inpaint_transparent_regions(
                self.original_image.copy(), # Provide a copy of the original image
                self.selected_regions,     # These are the regions to be filled
                iterations=15              # More iterations for better diffusion
            )
            
            unselected_image_name = f"{base_name}_unselected.png"
            unselected_image_path = os.path.join(output_dir, unselected_image_name)
            unselected_filled_image.save(unselected_image_path)
            print(f"Saved: {unselected_image_path}")

            messagebox.showinfo("Success", f"All images saved successfully in:\n{output_dir}")
            self.status_label.config(text="Processing complete. Images saved.")

            # Attempt to open the output folder automatically
            try:
                os.startfile(output_dir) # For Windows
            except AttributeError:
                # For macOS/Linux, use 'open' or 'xdg-open'
                import subprocess
                subprocess.run(['open', output_dir])
            except Exception as e:
                print(f"Could not open folder automatically: {e}")

        except Exception as e:
            messagebox.showerror("Error", f"An error occurred during processing or saving: {e}")
            self.status_label.config(text="Error during processing. Check console for details.")

# Main execution block
if __name__ == "__main__":
    root = tk.Tk()
    app = ImagePartSelectorApp(root)
    root.mainloop()
