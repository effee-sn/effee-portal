/**
 * The platform version (MAJOR.MINOR.PATCH), from Backend/package.json — kept
 * equal to Frontend/package.json. See CHANGELOG.md.
 */
const { version: APP_VERSION } = require('../../package.json');

module.exports = { APP_VERSION };
