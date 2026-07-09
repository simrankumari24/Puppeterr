/**
 * PinchLib
 *
 * This file was automatically generated for Pinch by APIMATIC v2.0 ( https://apimatic.io ) on 05/16/2016
 */

var _request = require('../Http/Client/RequestClient'),
    _configuration = require('../configuration'),
    _CustomAuthUtility = require('../CustomAuthUtility'),
    _APIHelper = require('../APIHelper');

var WebhookController = {

    /**
     * List the webhooks of the current user
     * @param {function} callback    Required parameter: Callback function in the form of function(error, response)
     *
     * @return {array}
     */
    list : function(callback){


        //prepare query string for API call;
        var _baseUri = _configuration.BASEURI;
        
        var _queryBuilder = _baseUri + "/webhooks";
        
        //validate and preprocess url
        var _queryUrl = _APIHelper.cleanUrl(_queryBuilder);
        
        //prepare headers
        var _headers = {
            "accept" : "application/json",
            "X-API-TOKEN" : _configuration.xAPITOKEN,
            "X-API-EMAIL" : _configuration.xAPIEMAIL
        };

        //Construct the request
        var _options = {
            queryUrl: _queryUrl,
            method: "GET",
            headers: _headers,
        };
        //append custom auth authorization
        _CustomAuthUtility.appendCustomAuthParams(_options);

        
        //Build the response processing. 
        function cb(_error, _response, _context) {
            if(_error){
                callback({errorMessage: _error.message, errorCode: _error.code},null,_context);
            }else if (_response.statusCode >= 200 && _response.statusCode <= 206) {
                callback(null,JSON.parse(_response.body),_context);
            }else{
                //Error handling using HTTP status codes
                if(_response.statusCode == 404){
                    callback(null,null,_context);
                    return;
                } else if (_response.statusCode == 401) {
                    callback({errorMessage: "Your API key is incorrect", errorCode: 401, errorResponse:_response.body},null,_context);
                } else if (_response.statusCode == 400) {
                    callback({errorMessage: "There is an error in the parameters you send", errorCode: 400, errorResponse:_response.body},null,_context);
                }callback({errorMessage: "HTTP Response Not OK", errorCode: _response.statusCode, errorResponse:_response.body},null,_context);
        }
        }
        _request(_options, cb);
    },
    

    /**
     * TODO: type endpoint description here
     * @param {Webhook} webhook    Required parameter: Example: 
     * @param {function} callback    Required parameter: Callback function in the form of function(error, response)
     *
     * @return {Webhook}
     */
    create : function(webhook, callback){

        //validating required parameters
        if (webhook == null || webhook == undefined){
            return callback({errorMessage: "The parameter 'webhook' is a required parameter and cannot be null.", errorCode:-1},null,null);
        }

        //prepare query string for API call;
        var _baseUri = _configuration.BASEURI;
        
        var _queryBuilder = _baseUri + "/webhooks";
        
        //validate and preprocess url
        var _queryUrl = _APIHelper.cleanUrl(_queryBuilder);
        
        //prepare headers
        var _headers = {
            "accept" : "application/json",
            "content-type" : "application/json; charset=utf-8",
            "X-API-TOKEN" : _configuration.xAPITOKEN,
            "X-API-EMAIL" : _configuration.xAPIEMAIL
        };

        //Remove null values
        _APIHelper.cleanObject(webhook);

        //Construct the request
        var _options = {
            queryUrl: _queryUrl,
            method: "POST",
            headers: _headers,
            body : _APIHelper.jsonSerialize(webhook),
        };
        //append custom auth authorization
        _CustomAuthUtility.appendCustomAuthParams(_options);

        
        //Build the response processing. 
        function cb(_error, _response, _context) {
            if(_error){
                callback({errorMessage: _error.message, errorCode: _error.code},null,_context);
            }else if (_response.statusCode >= 200 && _response.statusCode <= 206) {
                callback(null,JSON.parse(_response.body),_context);
            }else{
                //Error handling using HTTP status codes
                if(_response.statusCode == 404){
                    callback(null,null,_context);
                    return;
                } else if (_response.statusCode == 401) {
                    callback({errorMessage: "Your API key is incorrect", errorCode: 401, errorResponse:_response.body},null,_context);
                } else if (_response.statusCode == 400) {
                    callback({errorMessage: "There is an error in the parameters you send", errorCode: 400, errorResponse:_response.body},null,_context);
                }callback({errorMessage: "HTTP Response Not OK", errorCode: _response.statusCode, errorResponse:_response.body},null,_context);
        }
        }
        _request(_options, cb);
    },


    /**
     * TODO: type endpoint description here
     * @param {int} webhookId    Required parameter: Example: 
     * @param {Webhook|null} webhook    Optional parameter: Example: 
     * @param {function} callback    Required parameter: Callback function in the form of function(error, response)
     *
     * @return {Webhook}
     */
    update : function(webhookId, webhook, callback){

        //validating required parameters
        if (webhookId == null || webhookId == undefined){
            return callback({errorMessage: "The parameter 'webhookId' is a required parameter and cannot be null.", errorCode:-1},null,null);
        }

        //prepare query string for API call;
        var _baseUri = _configuration.BASEURI;
        
        var _queryBuilder = _baseUri + "/webhooks/{webhook_id}";
        
        //Process template parameters
        _queryBuilder = _APIHelper.appendUrlWithTemplateParameters(_queryBuilder, {
            "webhook_id" : webhookId
        });

        //validate and preprocess url
        var _queryUrl = _APIHelper.cleanUrl(_queryBuilder);
        
        //prepare headers
        var _headers = {
            "accept" : "application/json",
            "content-type" : "application/json; charset=utf-8",
            "X-API-TOKEN" : _configuration.xAPITOKEN,
            "X-API-EMAIL" : _configuration.xAPIEMAIL
        };

        //Remove null values
        _APIHelper.cleanObject(webhook);

        //Construct the request
        var _options = {
            queryUrl: _queryUrl,
            method: "PUT",
            headers: _headers,
            body : _APIHelper.jsonSerialize(webhook),
        };
        //append custom auth authorization
        _CustomAuthUtility.appendCustomAuthParams(_options);

        
        //Build the response processing. 
        function cb(_error, _response, _context) {
            if(_error){
                callback({errorMessage: _error.message, errorCode: _error.code},null,_context);
            }else if (_response.statusCode >= 200 && _response.statusCode <= 206) {
                callback(null,JSON.parse(_response.body),_context);
            }else{
                //Error handling using HTTP status codes
                if(_response.statusCode == 404){
                    callback(null,null,_context);
                    return;
                } else if (_response.statusCode == 401) {
                    callback({errorMessage: "Your API key is incorrect", errorCode: 401, errorResponse:_response.body},null,_context);
                } else if (_response.statusCode == 400) {
                    callback({errorMessage: "There is an error in the parameters you send", errorCode: 400, errorResponse:_response.body},null,_context);
                }callback({errorMessage: "HTTP Response Not OK", errorCode: _response.statusCode, errorResponse:_response.body},null,_context);
        }
        }
        _request(_options, cb);
    },


    /**
     * TODO: type endpoint description here
     * @param {int} webhookId    Required parameter: Example: 
     * @param {function} callback    Required parameter: Callback function in the form of function(error, response)
     *
     * @return {string}
     */
    destroy : function(webhookId, callback){

        //validating required parameters
        if (webhookId == null || webhookId == undefined){
            return callback({errorMessage: "The parameter 'webhookId' is a required parameter and cannot be null.", errorCode:-1},null,null);
        }

        //prepare query string for API call;
        var _baseUri = _configuration.BASEURI;
        
        var _queryBuilder = _baseUri + "/webhooks/{webhook_id}";
        
        //Process template parameters
        _queryBuilder = _APIHelper.appendUrlWithTemplateParameters(_queryBuilder, {
            "webhook_id" : webhookId
        });

        //validate and preprocess url
        var _queryUrl = _APIHelper.cleanUrl(_queryBuilder);
        
        //prepare headers
        var _headers = {
            "X-API-TOKEN" : _configuration.xAPITOKEN,
            "X-API-EMAIL" : _configuration.xAPIEMAIL
        };

        //Construct the request
        var _options = {
            queryUrl: _queryUrl,
            method: "DELETE",
            headers: _headers,
        };
        //append custom auth authorization
        _CustomAuthUtility.appendCustomAuthParams(_options);

        
        //Build the response processing. 
        function cb(_error, _response, _context) {
            if(_error){
                callback({errorMessage: _error.message, errorCode: _error.code},null,_context);
            }else if (_response.statusCode >= 200 && _response.statusCode <= 206) {
                callback(null, _response.body,_context);
            }else{
                //Error handling using HTTP status codes
                if(_response.statusCode == 404){
                    callback(null,null,_context);
                    return;
                } else if (_response.statusCode == 401) {
                    callback({errorMessage: "Your API key is incorrect", errorCode: 401, errorResponse:_response.body},null,_context);
                } else if (_response.statusCode == 400) {
                    callback({errorMessage: "There is an error in the parameters you send", errorCode: 400, errorResponse:_response.body},null,_context);
                }callback({errorMessage: "HTTP Response Not OK", errorCode: _response.statusCode, errorResponse:_response.body},null,_context);
        }
        }
        _request(_options, cb);
    },


    /**
     * Get a specific webhook by its id
     * @param {string} id    Required parameter: Example: 
     * @param {function} callback    Required parameter: Callback function in the form of function(error, response)
     *
     * @return {Webhook}
     */
    get : function(id, callback){

        //validating required parameters
        if (id == null || id == undefined){
            return callback({errorMessage: "The parameter 'id' is a required parameter and cannot be null.", errorCode:-1},null,null);
        }

        //prepare query string for API call;
        var _baseUri = _configuration.BASEURI;
        
        var _queryBuilder = _baseUri + "/webhooks/{id}";
        
        //Process template parameters
        _queryBuilder = _APIHelper.appendUrlWithTemplateParameters(_queryBuilder, {
            "id" : id
        });

        //validate and preprocess url
        var _queryUrl = _APIHelper.cleanUrl(_queryBuilder);
        
        //prepare headers
        var _headers = {
            "accept" : "application/json",
            "X-API-TOKEN" : _configuration.xAPITOKEN,
            "X-API-EMAIL" : _configuration.xAPIEMAIL
        };

        //Construct the request
        var _options = {
            queryUrl: _queryUrl,
            method: "GET",
            headers: _headers,
        };
        //append custom auth authorization
        _CustomAuthUtility.appendCustomAuthParams(_options);

        
        //Build the response processing. 
        function cb(_error, _response, _context) {
            if(_error){
                callback({errorMessage: _error.message, errorCode: _error.code},null,_context);
            }else if (_response.statusCode >= 200 && _response.statusCode <= 206) {
                callback(null,JSON.parse(_response.body),_context);
            }else{
                //Error handling using HTTP status codes
                if(_response.statusCode == 404){
                    callback(null,null,_context);
                    return;
                } else if (_response.statusCode == 401) {
                    callback({errorMessage: "Your API key is incorrect", errorCode: 401, errorResponse:_response.body},null,_context);
                } else if (_response.statusCode == 400) {
                    callback({errorMessage: "There is an error in the parameters you send", errorCode: 400, errorResponse:_response.body},null,_context);
                }callback({errorMessage: "HTTP Response Not OK", errorCode: _response.statusCode, errorResponse:_response.body},null,_context);
        }
        }
        _request(_options, cb);
    }
    
};

module.exports = WebhookController;