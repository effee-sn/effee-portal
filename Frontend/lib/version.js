import pkg from '../package.json';

/**
 * The platform version (MAJOR.MINOR.PATCH), from Frontend/package.json — kept
 * equal to Backend/package.json. Every release is listed in CHANGELOG.md and
 * tagged in git as v<version>.
 */
export const APP_VERSION = pkg.version;
