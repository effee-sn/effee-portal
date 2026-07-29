const { lookupRepository } = require('./lookup.repository');

/**
 * Lookup business logic.
 *
 * Thin by design — these are reference lists, not a domain. The layer exists so
 * that lookups stay consistent with the rest of the codebase and have somewhere
 * to grow: scoping roles to what the caller may assign, or filtering users by
 * department, both belong here rather than in a controller.
 *
 * @param {ReturnType<typeof import('./lookup.repository').createLookupRepository>} repository
 */
function createLookupService(repository) {
  return {
    /** @returns {Promise<object[]>} */
    getRoles() {
      return repository.findRoles();
    },

    /** @returns {Promise<object[]>} */
    getUsers() {
      return repository.findActiveUsers();
    },

    /** @returns {Promise<object[]>} */
    getPermissions() {
      return repository.findPermissions();
    },

    /** @returns {Promise<object[]>} */
    getModules() {
      return repository.findModules();
    },

    /** @returns {Promise<object[]>} */
    getDepartments() {
      return repository.findDepartments();
    },
  };
}

const lookupService = createLookupService(lookupRepository);

module.exports = { lookupService, createLookupService };
