const { currencyService } = require('./currency.service');
const { ApiResponse } = require('../../core');
const { requestContext } = require('../../core/http/requestContext');

/** Currency HTTP controller (Master Data → Currencies). */

/** `GET /currencies` */
const listCurrencies = async (req, res) => {
  ApiResponse.ok(res, await currencyService.list());
};

/** `GET /currencies/options` — active currencies with their current rate, for dropdowns. */
const getCurrencyOptions = async (req, res) => {
  ApiResponse.ok(res, await currencyService.options());
};

/** `GET /currencies/:code` — with rate history. */
const getCurrency = async (req, res) => {
  ApiResponse.ok(res, await currencyService.getByCode(req.params.code));
};

/** `POST /currencies` */
const createCurrency = async (req, res) => {
  ApiResponse.created(res, await currencyService.create(req.body, requestContext(req)));
};

/** `PUT /currencies/:code` */
const updateCurrency = async (req, res) => {
  ApiResponse.ok(res, await currencyService.update(req.params.code, req.body, requestContext(req)));
};

/** `POST /currencies/:code/rates` */
const addRate = async (req, res) => {
  ApiResponse.created(res, await currencyService.addRate(req.params.code, req.body, requestContext(req)));
};

/** `DELETE /currencies/:code/rates/:rateId` */
const deleteRate = async (req, res) => {
  ApiResponse.ok(res, await currencyService.deleteRate(req.params.code, req.params.rateId, requestContext(req)));
};

/** `POST /currencies/:code/default` */
const setDefaultCurrency = async (req, res) => {
  ApiResponse.ok(res, await currencyService.setDefault(req.params.code, requestContext(req)));
};

/** `DELETE /currencies/:code` */
const deleteCurrency = async (req, res) => {
  await currencyService.delete(req.params.code, requestContext(req));
  ApiResponse.ok(res, { code: req.params.code });
};

module.exports = {
  listCurrencies, getCurrencyOptions, getCurrency, createCurrency, updateCurrency,
  addRate, deleteRate, setDefaultCurrency, deleteCurrency,
};
