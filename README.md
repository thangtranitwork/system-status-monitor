# System Status Monitor

A GNOME Shell extension that displays real-time CPU & RAM usage directly in your status bar (panel).

## Features
- **Status Bar Integration**: Shows `CPU XX% RAM YY%` right next to the clock.
- **Color-Coded Status**: Green (normal), Amber (warning), and Red (critical) status indications.
- **GNOME Shell Notifications**: High usage alert notifications (customizable threshold, default 80%) with a built-in alert cooldown to prevent spamming.
- **Preferences Dialog**: Easily configure refresh interval, alert threshold, and alert cooldown.

## Installation

### Manual Installation
Copy this directory to your GNOME extensions folder:
```bash
cp -r system-floating-monitor@local ~/.local/share/gnome-shell/extensions/
```

Compile GSettings schema:
```bash
glib-compile-schemas ~/.local/share/gnome-shell/extensions/system-floating-monitor@local/schemas/
```

Restart GNOME Shell (`Alt + F2` -> `r` on X11, or log out and log back in on Wayland) and enable the extension:
```bash
gnome-extensions enable system-floating-monitor@local
```
