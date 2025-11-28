
function getHoursFromNotificationSetting(setting: string): number {
    if (!setting) return 2;

    // Normalize: lowercase, remove spaces/dashes, collapse synonyms
    const v = setting
        .toString()
        .toLowerCase()
        .trim()
        .replace(/\s|-|_/g, '') // remove spaces, dashes, and underscores
        .replace(/hours?/, 'hr')
        .replace(/hour/, 'hr')
        .replace(/minutes?/, 'min')
        .replace(/minute/, 'min');

    console.log(`Input: "${setting}" -> Transformed: "${v}"`);

    switch (v) {
        case '5min':
        case 'lastminute':
            return 0.0833; // 5 minutes
        case '15min':
            return 0.25;
        case '30min':
            return 0.5;
        case '1hr':
        case '1h':
        case '1_hour':
            return 1;
        case '2hr':
        case '2h':
        case '2_hours':
            return 2;
        case '4hr':
        case '4h':
            return 4;
        case '1day':
        case 'daybefore':
        case 'day_before':
            return 24;
        case '2day':
        case '2days':
            return 48;
        case 'never':
        case 'off':
            return 0;
        default:
            console.log(`  -> Hit default case (2)`);
            return 2; // sensible default
    }
}

console.log("Testing '1_hour':", getHoursFromNotificationSetting('1_hour'));
console.log("Testing '2_hours':", getHoursFromNotificationSetting('2_hours'));
console.log("Testing 'day_before':", getHoursFromNotificationSetting('day_before'));
