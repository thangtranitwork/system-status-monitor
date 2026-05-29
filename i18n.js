import GLib from 'gi://GLib';

const TRANSLATIONS = {
    en: {
        // extension.js
        preferences: 'Preferences…',
        cpu_label: 'CPU: {pct}%',
        ram_label: 'RAM: {pct}%',
        alert_title: '⚠️ High {label}: {pct}%',
        alert_body: '{label} is at {pct}% — exceeding threshold of {threshold}%',
        notification_title: 'System Status Monitor',

        // prefs.js
        general: 'General',
        update_settings: 'Update Settings',
        update_settings_desc: 'Configure how often system stats are refreshed',
        refresh_interval: 'Refresh Interval',
        refresh_interval_desc: 'Seconds between each CPU & RAM update (1 – 60)',
        alert_settings: 'Alert Settings',
        alert_settings_desc: 'Get notified when CPU or RAM is running high',
        alert_threshold: 'Alert Threshold',
        alert_threshold_desc: 'Send notification when usage exceeds this % (50 – 99)',
        alert_cooldown: 'Alert Cooldown',
        alert_cooldown_desc: 'Minimum seconds between repeated alerts (10 – 600)',
        language: 'Language',
        language_desc: 'Select display language',
        lang_auto: 'System Default / Mặc định',
        lang_en: 'English',
        lang_vi: 'Tiếng Việt'
    },
    vi: {
        // extension.js
        preferences: 'Tùy chỉnh…',
        cpu_label: 'CPU: {pct}%',
        ram_label: 'RAM: {pct}%',
        alert_title: '⚠️ {label} cao: {pct}%',
        alert_body: '{label} đang ở mức {pct}% — vượt ngưỡng {threshold}%',
        notification_title: 'Giám sát Trạng thái Hệ thống',

        // prefs.js
        general: 'Chung',
        update_settings: 'Cài đặt cập nhật',
        update_settings_desc: 'Cấu hình tần suất cập nhật thông số hệ thống',
        refresh_interval: 'Tần suất cập nhật',
        refresh_interval_desc: 'Thời gian giãn cách giữa các lần cập nhật CPU & RAM (1 – 60 giây)',
        alert_settings: 'Cài đặt cảnh báo',
        alert_settings_desc: 'Nhận thông báo khi sử dụng CPU hoặc RAM quá cao',
        alert_threshold: 'Ngưỡng cảnh báo',
        alert_threshold_desc: 'Gửi thông báo khi mức sử dụng vượt quá tỷ lệ % này (50 – 99)',
        alert_cooldown: 'Thời gian chờ cảnh báo',
        alert_cooldown_desc: 'Thời gian tối thiểu giữa các lần cảnh báo lặp lại (10 – 600 giây)',
        language: 'Ngôn ngữ',
        language_desc: 'Chọn ngôn ngữ hiển thị',
        lang_auto: 'Mặc định hệ thống',
        lang_en: 'Tiếng Anh (English)',
        lang_vi: 'Tiếng Việt'
    }
};

export function getLanguage(settings) {
    const langSetting = settings ? settings.get_string('language') : 'auto';
    if (langSetting === 'auto') {
        const langs = GLib.get_language_names();
        for (const lang of langs) {
            if (lang.startsWith('vi')) {
                return 'vi';
            }
        }
        return 'en';
    }
    return langSetting;
}

export function t(lang, key, params = {}) {
    const dict = TRANSLATIONS[lang] || TRANSLATIONS.en;
    let text = dict[key] || TRANSLATIONS.en[key] || '';
    if (typeof text === 'string') {
        for (const [k, v] of Object.entries(params)) {
            text = text.replace(`{${k}}`, v);
        }
    }
    return text;
}
