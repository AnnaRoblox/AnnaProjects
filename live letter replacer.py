#!/usr/bin/env python3
"""
Crash-proof live letter replacer with a GUI.

Logs every problem to the log file in the same folder.
Use the GUI to select a character set and toggle the replacer ON or OFF.

Hotkeys:
- Pause/Break: Toggles the replacer ON/OFF.
- End: Quits the application.
"""
import pathlib
import traceback
import sys
import time
import threading

# These will be imported in the main block to handle missing libraries gracefully
tk = None
ttk = None
keyboard = None

# --------------------------------------------------------------------------- #
# 1.  Logging and Master Table                                                #
# --------------------------------------------------------------------------- #
LOG_FILE = pathlib.Path(__file__).with_suffix(".log")

MASTER = {
    "normal": {
        'a':'a','b':'b','c':'c','d':'d','e':'e','f':'f','g':'g','h':'h','i':'i',
        'j':'j','k':'k','l':'l','m':'m','n':'n','o':'o','p':'p','q':'q','r':'r',
        's':'s','t':'t','u':'u','v':'v','w':'w','x':'x','y':'y','z':'z',
        'A':'A','B':'B','C':'C','D':'D','E':'E','F':'F','G':'G','H':'H','I':'I',
        'J':'J','K':'K','L':'L','M':'M','N':'N','O':'O','P':'P','Q':'Q','R':'R',
        'S':'S','T':'T','U':'U','V':'V','W':'W','X':'X','Y':'Y','Z':'Z'
       },
    "bold": {
        'a':'𝐚','b':'𝐛','c':'𝐜','d':'𝐝','e':'𝐞','f':'𝐟','g':'𝐠','h':'𝐡','i':'𝐢',
        'j':'𝐣','k':'𝐤','l':'𝐥','m':'𝐦','n':'𝐧','o':'𝐨','p':'𝐩','q':'𝐪','r':'𝐫',
        's':'𝐬','t':'𝐭','u':'𝐮','v':'𝐯','w':'𝐰','x':'𝐱','y':'𝐲','z':'𝐳',
        'A':'𝐀','B':'𝐁','C':'𝐂','D':'𝐃','E':'𝐄','F':'𝐅','G':'𝐆','H':'𝐇','I':'𝐈',
        'J':'𝐉','K':'𝐊','L':'𝐋','M':'𝐌','N':'𝐍','O':'𝐎','P':'𝐏','Q':'𝐐','R':'𝐑',
        'S':'𝐒','T':'𝐓','U':'𝐔','V':'𝐕','W':'𝐖','X':'𝐗','Y':'𝐘','Z':'𝐙'
    },
     "bypass": {         
                'a':'а','b':'b','c':'с','d':'ԁ','e':'е','f':'f','g':'ց','h':'հ','i':'і',
                'j':'ј','k':'k','l':'ӏ','m':'m','n':'ո','o':'օ','p':'р','q':'q','r':'r',
                's':'ѕ','t':'t','u':'ս','v':'v','w':'ᴡ','x':'х','y':'у','z':'ⴭ',
                'A':'А','B':'В','C':'Ϲ','D':'𝖣','E':'Е','F':'𝖥','G':'Ԍ','H':'Η','I':'𐌠',
                'J':'Ј','K':'K','L':'𝖫','M':'𝖬','N':'𝖭','O':'Օ','P':'Р','Q':'Q','R':'𝖱',
                'S':'Տ','T':'Т','U':'Ս','V':'𝖵','W':'Ԝ','X':'Χ','Y':'Υ','Z':'Ⴭ'         },
    "sans": {
        'a':'𝗮','b':'𝗯','c':'𝗰','d':'𝗱','e':'𝗲','f':'𝗳','g':'𝗴','h':'𝗵','i':'𝗶',
        'j':'𝗷','k':'𝗸','l':'𝗹','m':'𝗺','n':'𝗻','o':'𝗼','p':'𝗽','q':'𝗾','r':'𝗿',
        's':'𝘀','t':'𝘁','u':'𝘂','v':'𝘃','w':'𝘄','x':'𝘅','y':'𝘆','z':'𝘇',
        'A':'𝗔','B':'𝗕','C':'𝗖','D':'𝗗','E':'𝗘','F':'𝗙','G':'𝗚','H':'𝗛','I':'𝗜',
        'J':'𝗝','K':'𝗞','L':'𝗟','M':'𝗠','N':'𝗡','O':'𝗢','P':'𝗣','Q':'𝗤','R':'𝗥',
        'S':'𝗦','T':'𝗧','U':'𝗨','V':'𝗩','W':'𝗪','X':'𝗫','Y':'𝗬','Z':'𝗭'
    },
    "box": {
        'a':'🄰','b':'🄱','c':'🄲','d':'🄳','e':'🄴','f':'🄵','g':'🄶','h':'🄷','i':'🄸',
        'j':'🄹','k':'🄺','l':'🄻','m':'🄼','n':'🄽','o':'🄾','p':'🄿','q':'🅀','r':'🅁',
        's':'🅂','t':'🅃','u':'🅄','v':'🅅','w':'🅆','x':'🅇','y':'🅈','z':'🅉',
        'A':'🄰','B':'🄱','C':'🄲','D':'🄳','E':'🄴','F':'🄵','G':'🄶','H':'🄷','I':'🄸',
        'J':'🄹','K':'🄺','L':'🄻','M':'🄼','N':'🄽','O':'🄾','P':'🄿','Q':'🅀','R':'🅁',
        'S':'🅂','T':'🅃','U':'🅄','V':'🅅','W':'🅆','X':'🅇','Y':'🅈','Z':'🅉'
    },
    "square": {
        'a':'🅰','b':'🅱','c':'🅲','d':'🅳','e':'🅴','f':'🅵','g':'🅶','h':'🅷','i':'🅸',
        'j':'🅹','k':'🅺','l':'🅻','m':'🅼','n':'🅽','o':'🅾','p':'🅿','q':'🆀','r':'🆁',
        's':'🆂','t':'🆃','u':'🆄','v':'🆅','w':'🆆','x':'🆇','y':'🆈','z':'🆉',
        'A':'🅰','B':'🅱','C':'🅲','D':'🅳','E':'🅴','F':'🅵','G':'🅶','H':'🅷','I':'🅸',
        'J':'🅹','K':'🅺','L':'🅻','M':'🅼','N':'🅽','O':'🅾','P':'🅿','Q':'🆀','R':'🆁',
        'S':'🆂','T':'🆃','U':'🆄','V':'🆅','W':'🆆','X':'🆇','Y':'🆈','Z':'🆉'
    },
    "circle": {
        'a':'ⓐ','b':'ⓑ','c':'ⓒ','d':'ⓓ','e':'ⓔ','f':'ⓕ','g':'ⓖ','h':'ⓗ','i':'ⓘ',
        'j':'ⓙ','k':'ⓚ','l':'ⓛ','m':'ⓜ','n':'ⓝ','o':'ⓞ','p':'ⓟ','q':'ⓠ','r':'ⓡ',
        's':'ⓢ','t':'ⓣ','u':'ⓤ','v':'ⓥ','w':'ⓦ','x':'ⓧ','y':'ⓨ','z':'ⓩ',
        'A':'Ⓐ','B':'Ⓑ','C':'Ⓒ','D':'Ⓓ','E':'Ⓔ','F':'Ⓕ','G':'Ⓖ','H':'Ⓗ','I':'Ⓘ',
        'J':'Ⓙ','K':'Ⓚ','L':'Ⓛ','M':'Ⓜ','N':'Ⓝ','O':'Ⓞ','P':'Ⓟ','Q':'Ⓠ','R':'Ⓡ',
        'S':'Ⓢ','T':'Ⓣ','U':'Ⓤ','V':'Ⓥ','W':'Ⓦ','X':'Ⓧ','Y':'Ⓨ','Z':'Ⓩ'
    },
    "monospace": {
        'a':'𝚊','b':'𝚋','c':'𝚌','d':'𝚍','e':'𝚎','f':'𝚏','g':'𝚐','h':'𝚑','i':'𝚒',
        'j':'𝚓','k':'𝚔','l':'𝚕','m':'𝚖','n':'𝚗','o':'𝚘','p':'𝚙','q':'𝚚','r':'𝚛',
        's':'𝚜','t':'𝚝','u':'𝚞','v':'𝚟','w':'𝚠','x':'𝚡','y':'𝚢','z':'𝚣',
        'A':'𝙰','B':'𝙱','C':'𝙲','D':'𝙳','E':'𝙴','F':'𝙵','G':'𝙶','H':'𝙷','I':'𝙸',
        'J':'𝙹','K':'𝙺','L':'𝙻','M':'𝙼','N':'𝙽','O':'𝙾','P':'𝙿','Q':'𝚀','R':'𝚁',
        'S':'𝚂','T':'𝚃','U':'𝚄','V':'𝚅','W':'𝚆','X':'𝚇','Y':'𝚈','Z':'𝚉'
    },
    "canadian": {
        'a':'ᗩ','b':'ᗷ','c':'ᑕ','d':'ᗪ','e':'E','f':'ᖴ','g':'G','h':'ᕼ','i':'Ӏ',
        'j':'ᒍ','k':'K','l':'ᒪ','m':'ᗰ','n':'ᑎ','o':'O','p':'ᑭ','q':'Q','r':'ᖇ',
        's':'S','t':'T','u':'ᑌ','v':'ᐯ','w':'ᗯ','x':'᙭','y':'Y','z':'Z',
        'A':'ᗩ','B':'ᗷ','C':'ᑕ','D':'ᗪ','E':'E','F':'ᖴ','G':'G','H':'ᕼ','I':'I',
        'J':'ᒍ','K':'K','L':'ᒪ','M':'ᗰ','N':'ᑎ','O':'O','P':'ᑭ','Q':'Q','R':'ᖇ',
        'S':'S','T':'T','U':'ᑌ','V':'ᐯ','W':'ᗯ','X':'᙭','Y':'Y','Z':'Z'
    },
    "fraktur": {
        'a':'𝖆','b':'𝖇','c':'𝖈','d':'𝖉','e':'𝖊','f':'𝖋','g':'𝖌','h':'𝖍','i':'𝖎',
        'j':'𝖏','k':'𝖐','l':'𝖑','m':'𝖒','n':'𝖓','o':'𝖔','p':'𝖕','q':'𝖖','r':'𝖗',
        's':'𝖘','t':'𝖙','u':'𝖚','v':'𝖛','w':'𝖜','x':'𝖝','y':'𝖞','z':'𝖟',
        'A':'𝕬','B':'𝕭','C':'𝕮','D':'𝕯','E':'𝕰','F':'𝕱','G':'𝕲','H':'𝕳','I':'𝕴',
        'J':'𝕵','K':'𝕶','L':'𝕷','M':'𝕸','N':'𝕹','O':'𝕺','P':'𝕻','Q':'𝕼','R':'𝕽',
        'S':'𝕾','T':'𝕿','U':'𝖀','V':'𝖁','W':'𝖂','X':'𝖃','Y':'𝖄','Z':'𝖅'
    },
    "italic": {
        'a':'𝘢','b':'𝘣','c':'𝘤','d':'𝘥','e':'𝘦','f':'𝘧','g':'𝘨','h':'𝘩','i':'𝘪',
        'j':'𝘫','k':'𝘬','l':'𝘭','m':'𝘮','n':'𝘯','o':'𝘰','p':'𝘱','q':'𝘲','r':'𝘳',
        's':'𝘴','t':'𝘵','u':'𝘶','v':'𝘷','w':'𝘸','x':'𝘹','y':'𝘺','z':'𝘻',
        'A':'𝘈','B':'𝘉','C':'𝘊','D':'𝘋','E':'𝘌','F':'𝘍','G':'𝘎','H':'𝘏','I':'𝘐',
        'J':'𝘑','K':'𝘒','L':'𝘓','M':'𝘔','N':'𝘕','O':'𝘖','P':'𝘗','Q':'𝘘','R':'𝘙',
        'S':'𝘚','T':'𝘛','U':'𝘜','V':'𝘝','W':'𝘞','X':'𝘟','Y':'𝘠','Z':'𝘡'
    },
    "double": {
        'a':'𝕒','b':'𝕓','c':'𝕔','d':'𝕕','e':'𝕖','f':'𝕗','g':'𝕘','h':'𝕙','i':'𝕚',
        'j':'𝕛','k':'𝕜','l':'𝕝','m':'𝕞','n':'𝕟','o':'𝕠','p':'𝕡','q':'𝕢','r':'𝕣',
        's':'𝕤','t':'𝕥','u':'𝕦','v':'𝕧','w':'𝕨','x':'𝕩','y':'𝕪','z':'𝕫',
        'A':'𝔸','B':'𝔹','C':'ℂ','D':'𝔻','E':'𝔼','F':'𝔽','G':'𝔾','H':'ℍ','I':'𝕀',
        'J':'𝕁','K':'𝕂','L':'𝕃','M':'𝕄','N':'ℕ','O':'𝕆','P':'ℙ','Q':'ℚ','R':'ℝ',
        'S':'𝕊','T':'𝕋','U':'𝕌','V':'𝕍','W':'𝕎','X':'𝕏','Y':'𝕐','Z':'ℤ'
    },
    "smallcaps": {
        'a':'ᴀ','b':'ʙ','c':'ᴄ','d':'ᴅ','e':'ᴇ','f':'ꜰ','g':'ɢ','h':'ʜ','i':'ɪ',
        'j':'ᴊ','k':'ᴋ','l':'ʟ','m':'ᴍ','n':'ɴ','o':'ᴏ','p':'ᴘ','q':'ǫ','r':'ʀ',
        's':'ꜱ','t':'ᴛ','u':'ᴜ','v':'ᴠ','w':'ᴡ','x':'x','y':'ʏ','z':'ᴢ',
        'A':'ᴀ','B':'ʙ','C':'ᴄ','D':'ᴅ','E':'ᴇ','F':'ꜰ','G':'ɢ','H':'ʜ','I':'ɪ',
        'J':'ᴊ','K':'ᴋ','L':'ʟ','M':'ᴍ','N':'ɴ','O':'ᴏ','P':'ᴘ','Q':'ǫ','R':'ʀ',
        'S':'ꜱ','T':'ᴛ','U':'ᴜ','V':'ᴠ','W':'ᴡ','X':'x','Y':'ʏ','Z':'ᴢ'
    }
}

# --------------------------------------------------------------------------- #
# 2.  Crash Logger                                                            #
# --------------------------------------------------------------------------- #
def log_exc():
    """Appends exception info to the log file."""
    with LOG_FILE.open("a", encoding="utf-8") as f:
        f.write("-" * 60 + "\n")
        f.write(time.strftime("%Y-%m-%d %H:%M:%S") + "\n")
        traceback.print_exc(file=f)

# --------------------------------------------------------------------------- #
# 3.  GUI Application Class                                                   #
# --------------------------------------------------------------------------- #
class ReplacerApp:
    # 1.  All methods exist before anyone tries to call them
    def update_status_label(self):
        status = "ON" if self.shared_state["active"] else "OFF"
        set_name = "None"
        for name, tbl in MASTER.items():
            if tbl is self.shared_state["table"]:
                set_name = name
                break
        self.status_var.set(f"Status: {status}  |  Set: {set_name}")

    def toggle_active(self):
        self.shared_state["active"] = not self.shared_state["active"]
        print(f"Active state toggled to: {self.shared_state['active']}")
        self.update_status_label()

    def on_set_select(self, _event=None):
        set_name = self.set_var.get()
        self.shared_state["table"] = MASTER[set_name]
        print(f"Switched to set: {set_name}")
        self.update_status_label()

    # 2.  Constructor last (or at least after the methods it calls)
    def __init__(self, master):
        self.master = master
        master.title("Character Replacer")
        master.attributes('-topmost', False)
        master.resizable(False, False)

        self.shared_state = {"table": MASTER["normal"], "active": True}

        self.build_widgets()
        self.start_keyboard_listener()
        self.update_status_label()          # safe now
        self.master.protocol("WM_DELETE_WINDOW", self.on_closing)

    def on_closing(self):
        """Handle the window closing event."""
        print("Window closed. Cleaning up...")
        keyboard.unhook_all()
        self.master.destroy()

    def build_widgets(self):
        """Create and arrange all the GUI elements."""
        main_frame = ttk.Frame(self.master, padding="10")
        main_frame.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))

        # --- Drop-down for sets ---
        set_label = ttk.Label(main_frame, text="Select Character Set:")
        set_label.grid(row=0, column=0, sticky=tk.W, pady=(0, 5))

        self.set_var = tk.StringVar(value="normal")          # current selection
        self.combo = ttk.Combobox(main_frame,
                                  textvariable=self.set_var,
                                  values=list(MASTER.keys()),
                                  state="readonly",
                                  width=15)
        self.combo.grid(row=0, column=1, sticky=tk.W, padx=(5, 0))
        self.combo.bind("<<ComboboxSelected>>", self.on_set_select)

        # --- Status Label ---
        self.status_var = tk.StringVar()
        status_label = ttk.Label(main_frame, textvariable=self.status_var, font=("Segoe UI", 9))
        status_label.grid(row=1, column=0, columnspan=2, sticky=tk.W, pady=(10, 0))

        # --- Buttons ---
        toggle_button = ttk.Button(main_frame, text="Toggle ON/OFF", command=self.toggle_active)
        toggle_button.grid(row=2, column=0, sticky=(tk.W, tk.E), pady=(5, 0))

        quit_button = ttk.Button(main_frame, text="Quit", command=self.on_closing)
        quit_button.grid(row=2, column=1, sticky=(tk.W, tk.E), pady=(5, 0))

    def on_set_select(self, _event=None):
        """Called when the user picks a new set from the drop-down."""
        set_name = self.set_var.get()
        self.shared_state["table"] = MASTER[set_name]
        print(f"Switched to set: {set_name}")
        self.update_status_label()

    def toggle_active(self):
        """Toggles the replacer on and off."""
        self.shared_state["active"] = not self.shared_state["active"]
        print(f"Active state toggled to: {self.shared_state['active']}")
        self.update_status_label()
    
    def start_keyboard_listener(self):
        """Starts the keyboard monitoring in a separate daemon thread."""
        listener_thread = threading.Thread(target=self.keyboard_listener_worker, daemon=True)
        listener_thread.start()
    
    def keyboard_listener_worker(self):
        """
        This function runs in the background thread.
        It sets up the keyboard hooks and hotkeys.
        """
        # --- Helper for replacement ---
        def replace_one(char):
            """Inject the replacement character."""
            keyboard.send('backspace')  # remove original letter
            keyboard.write(char)        # send replacement

        # --- Main keyboard event handler ---
        def handler(event):
            """This callback runs for every key event."""
            if not self.shared_state["active"] or event.is_keypad:
                return True  # Let key through

            c = event.name  # 'a', 'b', 'shift+a' …
            if len(c) == 1 and c.isascii() and c.isalpha():
                repl = self.shared_state["table"].get(c)
                if repl:  # We want to replace
                    # Do the replacement in another quick thread to avoid blocking the hook
                    threading.Thread(target=replace_one, args=(repl,), daemon=True).start()
                    return False  # Suppress original keypress
            return True  # Let anything else through

        # Use add_hotkey for global toggles, it's cleaner
        keyboard.add_hotkey('pause', self.toggle_active)
        keyboard.add_hotkey('end', self.on_closing)
        
        # Install the low-level hook for character replacement
        keyboard.hook(handler)
        print("Keyboard listener started. Use the GUI or hotkeys (Pause, End).")
        # The hook will run as long as the main program is alive.
        # We use a threading event to keep this worker thread alive until the app closes.
        stop_event = threading.Event()
        # This is a trick to make the thread wait indefinitely without consuming CPU,
        # until the main program exits (since it's a daemon thread).
        stop_event.wait()


# --------------------------------------------------------------------------- #
# 4.  Entry Point                                                             #
# --------------------------------------------------------------------------- #
if __name__ == "__main__":
    try:
        # Import necessary libraries here to provide a clear error message
        # if they are not installed.
        import tkinter as tk
        from tkinter import ttk
        import keyboard

        # --- Create and run the application ---
        root = tk.Tk()
        app = ReplacerApp(root)
        root.mainloop()  # This blocks until the GUI window is closed
        print("\nGUI closed. Bye!")

    except ImportError as e:
        print(f"❌ ERROR: Missing required library: '{e.name}'")
        print("Please install it by running the following command:")
        print(f"pip install {e.name}")
        input("Press Enter to exit…")
    except KeyboardInterrupt:
        print("\nBye!")
    except Exception:
        log_exc()
        print(f"\n🔥 CRASH – details have been saved to '{LOG_FILE}'")
        input("Press Enter to exit…")
