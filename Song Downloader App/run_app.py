import os
import sys
import socket
import threading
import webbrowser
import tkinter as tk
from tkinter import messagebox
from app import app, load_config

def get_free_port():
    """Find an available port dynamically."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.bind(('127.0.0.1', 0))
        port = s.getsockname()[1]
        s.close()
        return port
    except Exception:
        return 5000  # Fallback

def start_flask(port):
    """Run Flask server in a separate thread."""
    # Turn off debug mode in production packaging to avoid duplicate reloader threads
    app.run(host='127.0.0.1', port=port, debug=False, use_reloader=False)

class BeatDropApp:
    def __init__(self, root, port):
        self.root = root
        self.port = port
        
        # Window setup
        self.root.title("BeatDrop - Control Panel")
        self.root.geometry("420x260")
        self.root.resizable(False, False)
        
        # Apply dark background matching web layout
        self.root.configure(bg="#0c0a14")
        
        # Main container padding
        frame = tk.Frame(root, bg="#0c0a14", padx=20, pady=20)
        frame.pack(fill=tk.BOTH, expand=True)
        
        # App Title
        title_label = tk.Label(
            frame, 
            text="BeatDrop Downloader", 
            font=("Outfit", 18, "bold"), 
            fg="#8b5cf6", 
            bg="#0c0a14"
        )
        title_label.pack(pady=(5, 10))
        
        # Active Port info
        status_label = tk.Label(
            frame, 
            text=f"Status: Service is running on http://127.0.0.1:{self.port}", 
            font=("Inter", 10), 
            fg="#10b981", 
            bg="#0c0a14"
        )
        status_label.pack(pady=5)
        
        # Download directory info
        config = load_config()
        download_dir = config.get("download_dir", "Not configured")
        
        # Shrink long path for aesthetic window display
        display_dir = download_dir
        if len(display_dir) > 40:
            display_dir = display_dir[:15] + "..." + display_dir[-25:]
            
        self.dir_label = tk.Label(
            frame, 
            text=f"Save Folder: {display_dir}", 
            font=("Inter", 9), 
            fg="#9d99b2", 
            bg="#0c0a14"
        )
        self.dir_label.pack(pady=(0, 15))
        
        # Button container
        btn_frame = tk.Frame(frame, bg="#0c0a14")
        btn_frame.pack(pady=10)
        
        # Open in Web Browser Button
        open_btn = tk.Button(
            btn_frame, 
            text="Open Web Interface", 
            font=("Outfit", 11, "bold"), 
            bg="#8b5cf6", 
            fg="white", 
            activebackground="#7c3aed", 
            activeforeground="white",
            borderwidth=0, 
            padx=16, 
            pady=8,
            cursor="hand2",
            command=self.open_browser
        )
        open_btn.pack(side=tk.LEFT, padx=10)
        
        # Shutdown & Exit Button
        stop_btn = tk.Button(
            btn_frame, 
            text="Exit App", 
            font=("Outfit", 11, "bold"), 
            bg="#ef4444", 
            fg="white", 
            activebackground="#dc2626", 
            activeforeground="white",
            borderwidth=0, 
            padx=16, 
            pady=8,
            cursor="hand2",
            command=self.shutdown
        )
        stop_btn.pack(side=tk.LEFT, padx=10)
        
        # Handle close window standard window close button (X)
        self.root.protocol("WM_DELETE_WINDOW", self.shutdown)
        
        # Open browser automatically on startup after 1 second delay
        self.root.after(1000, self.open_browser)

    def open_browser(self):
        webbrowser.open(f"http://127.0.0.1:{self.port}")
        
    def shutdown(self):
        # Gracefully shut down python process, including Flask daemon thread
        self.root.destroy()
        os._exit(0)

def main():
    # 1. Discover a free port
    port = get_free_port()
    
    # 2. Run Flask in a daemon thread
    flask_thread = threading.Thread(target=start_flask, args=(port,), daemon=True)
    flask_thread.start()
    
    # 3. Open Tkinter control panel
    root = tk.Tk()
    app = BeatDropApp(root, port)
    root.mainloop()

if __name__ == '__main__':
    main()
