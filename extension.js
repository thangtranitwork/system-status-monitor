import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

// Ngưỡng và cooldown được đọc động từ GSettings (xem prefs.js)

export default class SystemFloatingMonitor extends Extension {

    enable() {
        this._settings  = this.getSettings();
        this._lastCpu   = null;
        this._timer     = null;

        // Cooldown timestamps (Unix seconds) cho lần cuối báo
        this._lastCpuAlert = 0;
        this._lastRamAlert = 0;

        // Trạng thái "đang ở trên ngưỡng" để chỉ báo 1 lần mỗi đợt
        this._cpuAlerting = false;
        this._ramAlerting = false;

        // ── Notification source (dùng lại, không tạo mới mỗi lần) ────────────
        this._notifSource = null;

        // ── Panel button ──────────────────────────────────────────────────────
        this._indicator = new PanelMenu.Button(0.0, this.metadata.name, false);

        this._panelLabel = new St.Label({
            text: 'CPU --%  RAM --%',
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'system-monitor-panel-label',
        });
        this._indicator.add_child(this._panelLabel);

        // ── Dropdown menu ──────────────────────────────────────────────────────
        this._cpuItem = new PopupMenu.PopupMenuItem('CPU: --', { reactive: false });
        this._ramItem = new PopupMenu.PopupMenuItem('RAM: --', { reactive: false });

        this._indicator.menu.addMenuItem(this._cpuItem);
        this._indicator.menu.addMenuItem(this._ramItem);
        this._indicator.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const settingsItem = new PopupMenu.PopupMenuItem('Preferences…');
        settingsItem.connect('activate', () => this.openPreferences());
        this._indicator.menu.addMenuItem(settingsItem);

        // ── Add to status bar ─────────────────────────────────────────────────
        Main.panel.addToStatusArea(this.uuid, this._indicator);

        // ── React to settings changes ─────────────────────────────────────────
        this._settingsChangedId = this._settings.connect('changed', (s, key) => {
            if (key === 'refresh-interval') this._restartTimer();
            // alert-threshold / alert-cooldown đọc trực tiếp mỗi lần check → tự động
        });

        // ── First read + timer ────────────────────────────────────────────────
        this._updateStats();
        this._startTimer();
    }

    disable() {
        if (this._timer) {
            GLib.source_remove(this._timer);
            this._timer = null;
        }

        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }

        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }

        this._panelLabel    = null;
        this._cpuItem       = null;
        this._ramItem       = null;
        this._lastCpu       = null;
        this._notifSource   = null;
        this._settings      = null;
    }

    // ── Timer ────────────────────────────────────────────────────────────────

    _startTimer() {
        const interval = this._settings.get_int('refresh-interval');
        this._timer = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            interval,
            () => { this._updateStats(); return GLib.SOURCE_CONTINUE; }
        );
    }

    _restartTimer() {
        if (this._timer) { GLib.source_remove(this._timer); this._timer = null; }
        this._startTimer();
    }

    // ── System stats ─────────────────────────────────────────────────────────

    _readFile(path) {
        try {
            const [, bytes] = GLib.file_get_contents(path);
            return new TextDecoder().decode(bytes);
        } catch (_) { return ''; }
    }

    _getCpuUsage() {
        const stat = this._readFile('/proc/stat');
        const line = stat.split('\n')[0];
        if (!line.startsWith('cpu ')) return 0;

        const values = line.trim().split(/\s+/).slice(1).map(Number);
        const idle   = values[3] + values[4];
        const total  = values.reduce((s, v) => s + v, 0);

        if (!this._lastCpu) {
            this._lastCpu = { idle, total };
            return 0;
        }

        const idleDelta  = idle  - this._lastCpu.idle;
        const totalDelta = total - this._lastCpu.total;
        this._lastCpu = { idle, total };

        if (totalDelta === 0) return 0;
        return Math.round((1 - idleDelta / totalDelta) * 100);
    }

    _getRamUsage() {
        const info      = this._readFile('/proc/meminfo');
        const total     = Number(info.match(/MemTotal:\s+(\d+)/)?.[1]     || 0);
        const available = Number(info.match(/MemAvailable:\s+(\d+)/)?.[1] || 0);
        if (!total) return 0;
        return Math.round(((total - available) / total) * 100);
    }

    _colorFor(pct, threshold = 80) {
        if (pct >= 90)         return '#ff5555';  // critical
        if (pct >= threshold)  return '#ffb347';  // warning
        return '#88dd88';                         // normal
    }

    // ── Notification ─────────────────────────────────────────────────────────

    _ensureSource() {
        if (this._notifSource) return this._notifSource;

        this._notifSource = new MessageTray.Source({
            title: 'System Status Monitor',
            iconName: 'dialog-warning-symbolic',
        });

        // Tự dọn khi source bị destroy từ phía Shell
        this._notifSource.connect('destroy', () => {
            this._notifSource = null;
        });

        Main.messageTray.add(this._notifSource);
        return this._notifSource;
    }

    _sendAlert(title, body) {
        const source = this._ensureSource();
        const notification = new MessageTray.Notification({
            source,
            title,
            body,
            urgencyLevel: MessageTray.Urgency.CRITICAL,
            iconName: 'dialog-warning-symbolic',
        });
        source.addNotification(notification);
    }

    _checkAlert(label, pct, isAlerting, lastAlertTime) {
        const threshold = this._settings.get_int('alert-threshold');
        const cooldown  = this._settings.get_int('alert-cooldown');
        const now = Math.floor(Date.now() / 1000);

        if (pct >= threshold) {
            // Báo nếu: vừa vượt ngưỡng, HOẶC đã hết cooldown mà vẫn còn cao
            if (!isAlerting || (now - lastAlertTime) >= cooldown) {
                this._sendAlert(
                    `⚠️ ${label} cao: ${pct}%`,
                    `${label} đang ở mức ${pct}% — vượt ngưỡng ${threshold}%`
                );
                return { alerting: true, lastAlert: now };
            }
            return { alerting: true, lastAlert: lastAlertTime };
        }

        // Đã xuống dưới ngưỡng → reset để lần sau lại báo
        return { alerting: false, lastAlert: lastAlertTime };
    }

    // ── Update display ────────────────────────────────────────────────────────

    _updateStats() {
        if (!this._panelLabel) return;

        const cpu = this._getCpuUsage();
        const ram = this._getRamUsage();

        // Panel text
        this._panelLabel.set_text(`CPU ${cpu}%  RAM ${ram}%`);

        // Dropdown
        if (this._cpuItem) {
            const threshold = this._settings.get_int('alert-threshold');
            this._cpuItem.label.set_text(`CPU: ${cpu}%`);
            this._cpuItem.label.set_style(`color: ${this._colorFor(cpu, threshold)}; font-weight: bold;`);
        }
        if (this._ramItem) {
            const threshold = this._settings.get_int('alert-threshold');
            this._ramItem.label.set_text(`RAM: ${ram}%`);
            this._ramItem.label.set_style(`color: ${this._colorFor(ram, threshold)}; font-weight: bold;`);
        }

        // Cảnh báo 80%
        const cpuResult = this._checkAlert(
            'CPU', cpu, this._cpuAlerting, this._lastCpuAlert
        );
        this._cpuAlerting  = cpuResult.alerting;
        this._lastCpuAlert = cpuResult.lastAlert;

        const ramResult = this._checkAlert(
            'RAM', ram, this._ramAlerting, this._lastRamAlert
        );
        this._ramAlerting  = ramResult.alerting;
        this._lastRamAlert = ramResult.lastAlert;
    }
}
