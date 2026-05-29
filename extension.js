import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

import { t, getLanguage } from './i18n.js';

Gio._promisify(Gio.File.prototype, 'load_contents_async', 'load_contents_finish');

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
        this._notifSourceId = null;

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

        this._settingsItem = new PopupMenu.PopupMenuItem(t(getLanguage(this._settings), 'preferences'));
        this._settingsItemId = this._settingsItem.connect('activate', () => this.openPreferences());
        this._indicator.menu.addMenuItem(this._settingsItem);

        // ── Add to status bar ─────────────────────────────────────────────────
        Main.panel.addToStatusArea(this.uuid, this._indicator);

        // ── React to settings changes ─────────────────────────────────────────
        this._settingsChangedId = this._settings.connect('changed', (s, key) => {
            if (key === 'refresh-interval') this._restartTimer();
            if (key === 'language') this._updateLanguageStrings();
        });

        // ── First read + timer ────────────────────────────────────────────────
        this._updateStats().catch(err => console.error(err));
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

        if (this._settingsItem && this._settingsItemId) {
            this._settingsItem.disconnect(this._settingsItemId);
            this._settingsItemId = null;
        }

        if (this._notifSource) {
            if (this._notifSourceId) {
                this._notifSource.disconnect(this._notifSourceId);
                this._notifSourceId = null;
            }
            this._notifSource.destroy();
            this._notifSource = null;
        }

        if (this._panelLabel) {
            this._panelLabel.destroy();
            this._panelLabel = null;
        }

        if (this._cpuItem) {
            this._cpuItem.destroy();
            this._cpuItem = null;
        }

        if (this._ramItem) {
            this._ramItem.destroy();
            this._ramItem = null;
        }

        if (this._settingsItem) {
            this._settingsItem.destroy();
            this._settingsItem = null;
        }

        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }

        this._lastCpu       = null;
        this._settings      = null;
    }

    // ── Timer ────────────────────────────────────────────────────────────────

    _startTimer() {
        const interval = this._settings.get_int('refresh-interval');
        this._timer = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            interval,
            () => {
                this._updateStats().catch(err => console.error(err));
                return GLib.SOURCE_CONTINUE;
            }
        );
    }

    _restartTimer() {
        if (this._timer) {
            GLib.source_remove(this._timer);
            this._timer = null;
        }
        this._startTimer();
    }

    // ── System stats ─────────────────────────────────────────────────────────

    async _readFileAsync(path) {
        try {
            const file = Gio.File.new_for_path(path);
            const [, bytes] = await file.load_contents_async(null);
            return new TextDecoder().decode(bytes);
        } catch (_) {
            return '';
        }
    }

    async _getCpuUsage() {
        const stat = await this._readFileAsync('/proc/stat');
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

    async _getRamUsage() {
        const info      = await this._readFileAsync('/proc/meminfo');
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

        const lang = getLanguage(this._settings);
        this._notifSource = new MessageTray.Source({
            title: t(lang, 'notification_title'),
            iconName: 'dialog-warning-symbolic',
        });

        // Tự dọn khi source bị destroy từ phía Shell
        this._notifSourceId = this._notifSource.connect('destroy', () => {
            this._notifSource = null;
            this._notifSourceId = null;
        });

        Main.messageTray.add(this._notifSource);
        return this._notifSource;
    }

    _sendAlert(title, body) {
        const source = this._ensureSource();
        const notification = new MessageTray.Notification({
            source: source,
            title: title,
            body: body,
            gicon: Gio.Icon.new_for_string('dialog-warning-symbolic')
        });
        notification.urgency = MessageTray.Urgency.CRITICAL;
        source.addNotification(notification);
    }

    _checkAlert(label, pct, isAlerting, lastAlertTime) {
        const threshold = this._settings.get_int('alert-threshold');
        const cooldown  = this._settings.get_int('alert-cooldown');
        const now = Math.floor(Date.now() / 1000);

        if (pct >= threshold) {
            // Báo nếu: vừa vượt ngưỡng, HOẶC đã hết cooldown mà vẫn còn cao
            if (!isAlerting || (now - lastAlertTime) >= cooldown) {
                const lang = getLanguage(this._settings);
                const title = t(lang, 'alert_title', { label, pct });
                const body = t(lang, 'alert_body', { label, pct, threshold });
                this._sendAlert(title, body);
                return { alerting: true, lastAlert: now };
            }
            return { alerting: true, lastAlert: lastAlertTime };
        }

        // Đã xuống dưới ngưỡng → reset để lần sau lại báo
        return { alerting: false, lastAlert: lastAlertTime };
    }

    _updateLanguageStrings() {
        const lang = getLanguage(this._settings);
        
        if (this._settingsItem) {
            this._settingsItem.label.set_text(t(lang, 'preferences'));
        }
        if (this._notifSource) {
            this._notifSource.title = t(lang, 'notification_title');
        }
        this._updateStats().catch(err => console.error(err));
    }

    // ── Update display ────────────────────────────────────────────────────────

    async _updateStats() {
        if (!this._panelLabel) return;

        const cpu = await this._getCpuUsage();
        const ram = await this._getRamUsage();

        // Panel text
        this._panelLabel.set_text(`CPU ${cpu}%  RAM ${ram}%`);

        const threshold = this._settings.get_int('alert-threshold');
        const cpuColor = this._colorFor(cpu, threshold);
        const ramColor = this._colorFor(ram, threshold);
        const maxColor = cpu >= ram ? cpuColor : ramColor;

        // Colorize top panel label
        this._panelLabel.set_style(`color: ${maxColor}; font-weight: bold;`);

        const lang = getLanguage(this._settings);

        // Dropdown
        if (this._cpuItem) {
            this._cpuItem.label.set_text(t(lang, 'cpu_label', { pct: cpu }));
            this._cpuItem.label.set_style(`color: ${cpuColor}; font-weight: bold;`);
        }
        if (this._ramItem) {
            this._ramItem.label.set_text(t(lang, 'ram_label', { pct: ram }));
            this._ramItem.label.set_style(`color: ${ramColor}; font-weight: bold;`);
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
