SKYPATH COMPANION DASHBOARD - WINDOWS QUICK START
==================================================

ONE-TIME SETUP
  1. Install Node.js (LTS) from https://nodejs.org  [or: winget install OpenJS.NodeJS.LTS]
  2. Unzip this folder somewhere you keep games/tools, e.g. C:\skypath-dashboard

EVERY SESSION
  3. Double-click  "Start SkyPath.bat"
     - a console window opens (keep it open while playing)
     - your browser opens http://localhost:3000 automatically
  4. In Minecraft (Hypixel), type:  /skypath url http://localhost:3000
  5. Put http://localhost:3000/companion on your second screen. Done.

UPDATING (new versions)
  Double-click  "Update SkyPath.bat"  in this folder. It pulls the latest
  from GitHub. Close the dashboard first, update, then start it again.
  Your data.json is never touched by updates - it is your local file.

STOPPING
  Close the console window (or press Ctrl+C inside it).

NOTES
  - The jar for Minecraft 26.1.2 is in the downloads\ folder
    (skypath-companion-2.0.1.jar - goes in %appdata%\.minecraft\mods
     next to Fabric API).
  - Windows Firewall may ask to allow Node.js on first run - click Allow
    (private networks is enough for localhost use).
  - Your data lives in data.json in this folder. Back it up / copy it
    to carry goals, roadmap ticks and snapshots between machines.
  - Other devices on your wifi can open http://<your-pc-ip>:3000
    (run "ipconfig" to find your IPv4 address). The firewall rule must
    allow Node.js for that to work.
  - Different port needed? Edit the .bat and change the last line to:
    set PORT=3001
    node server.js
