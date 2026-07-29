const { lookupService } = require('./lookup.service');

/**
 * Lookup HTTP controller.
 *
 * Each endpoint returns a bare array, matching the existing contract used by
 * the forms that consume them (`apiGet('/lookup/roles').then(setRoles)`).
 */

/** @type {import('express').RequestHandler} */
const getRoles = async (req, res) => {
  res.json(await lookupService.getRoles());
};

/** @type {import('express').RequestHandler} */
const getUsers = async (req, res) => {
  res.json(await lookupService.getUsers());
};

/** @type {import('express').RequestHandler} */
const getPermissions = async (req, res) => {
  res.json(await lookupService.getPermissions());
};

/** @type {import('express').RequestHandler} */
const getModules = async (req, res) => {
  res.json(await lookupService.getModules());
};

/** @type {import('express').RequestHandler} */
const getDepartments = async (req, res) => {
  res.json(await lookupService.getDepartments());
};

module.exports = { getRoles, getUsers, getPermissions, getModules, getDepartments };
