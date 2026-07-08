/**
 * PinchLib
 *
 * This file was automatically generated for Pinch by APIMATIC v2.0 ( https://apimatic.io ) on 05/16/2016
 */

var _request = require('../Http/Client/RequestClient'),
    _configuration = require('../configuration'),
    _CustomAuthUtility = require('../CustomAuthUtility'),
    _APIHelper = require('../APIHelper');

var TicketController = {

    /**
     * List all the opened tickets of every clients you are working for
     * @param {function} callback    Required parameter: Callback function in the form of function(error, response)
     *
     * @return {array}
     */
    list : function(callback){


        //prepare query string for API call;
        var _baseUri = _configuration.BASEURI;
        
        var _queryBuilder = _baseUri + "/tickets";
        
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
     * This method returns no result but the status code tells you if the operation succedded
     * @param {string} ticketId    Required parameter: Example: 
     * @param {function} callback    Required parameter: Callback function in the form of function(error, response)
     *
     * @return {Ticket}
     */
    acceptIntervention : function(ticketId, callback){

        //validating required parameters
        if (ticketId == null || ticketId == undefined){
            return callback({errorMessage: "The parameter 'ticketId' is a required parameter and cannot be null.", errorCode:-1},null,null);
        }

        //prepare query string for API call;
        var _baseUri = _configuration.BASEURI;
        
        var _queryBuilder = _baseUri + "/tickets/{ticket_id}/accept";
        
        //Process template parameters
        _queryBuilder = _APIHelper.appendUrlWithTemplateParameters(_queryBuilder, {
            "ticket_id" : ticketId
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
            method: "POST",
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
     * @param {DateTime} interventionDate    Required parameter: Example: 
     * @param {string} ticketId    Required parameter: Example: 
     * @param {function} callback    Required parameter: Callback function in the form of function(error, response)
     *
     * @return {Ticket}
     */
    setInterventionDate : function(interventionDate, ticketId, callback){

        //validating required parameters
        if (interventionDate == null || interventionDate == undefined){
            return callback({errorMessage: "The parameter 'interventionDate' is a required parameter and cannot be null.", errorCode:-1},null,null);
        } else if (ticketId == null || ticketId == undefined){
            return callback({errorMessage: "The parameter 'ticketId' is a required parameter and cannot be null.", errorCode:-1},null,null);
        }

        //prepare query string for API call;
        var _baseUri = _configuration.BASEURI;
        
        var _queryBuilder = _baseUri + "/tickets/{ticket_id}/set_intervention_date";
        
        //Process template parameters
        _queryBuilder = _APIHelper.appendUrlWithTemplateParameters(_queryBuilder, {
            "ticket_id" : ticketId
        });

        //validate and preprocess url
        var _queryUrl = _APIHelper.cleanUrl(_queryBuilder);
        
        //prepare headers
        var _headers = {
            "accept" : "application/json",
            "X-API-TOKEN" : _configuration.xAPITOKEN,
            "X-API-EMAIL" : _configuration.xAPIEMAIL
        };

        //prepare form data
        var _form = {
            "intervention_date" : interventionDate
        };

        //Remove null values
        _APIHelper.cleanObject(_form);

        //Construct the request
        var _options = {
            queryUrl: _queryUrl,
            method: "POST",
            headers: _headers,
            form : _form,
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
     * @param {string} file    Required parameter: Example: 
     * @param {string} ticketId    Required parameter: Example: 
     * @param {function} callback    Required parameter: Callback function in the form of function(error, response)
     *
     * @return {Ticket}
     */
    uploadQuote : function(file, ticketId, callback){

        //validating required parameters
        if (file == null || file == undefined){
            return callback({errorMessage: "The parameter 'file' is a required parameter and cannot be null.", errorCode:-1},null,null);
        } else if (ticketId == null || ticketId == undefined){
            return callback({errorMessage: "The parameter 'ticketId' is a required parameter and cannot be null.", errorCode:-1},null,null);
        }

        //prepare query string for API call;
        var _baseUri = _configuration.BASEURI;
        
        var _queryBuilder = _baseUri + "/tickets/{ticket_id}/quote_upload";
        
        //Process template parameters
        _queryBuilder = _APIHelper.appendUrlWithTemplateParameters(_queryBuilder, {
            "ticket_id" : ticketId
        });

        //validate and preprocess url
        var _queryUrl = _APIHelper.cleanUrl(_queryBuilder);
        
        //prepare headers
        var _headers = {
            "accept" : "application/json",
            "X-API-TOKEN" : _configuration.xAPITOKEN,
            "X-API-EMAIL" : _configuration.xAPIEMAIL
        };

        //prepare form data
        var _formData = {
            "file" : file
        };

        //Remove null values
        _APIHelper.cleanObject(_formData);

        //Construct the request
        var _options = {
            queryUrl: _queryUrl,
            method: "POST",
            headers: _headers,
            formData : _formData,
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
     * @param {string} body    Required parameter: Example: 
     * @param {string} ticketId    Required parameter: Example: 
     * @param {function} callback    Required parameter: Callback function in the form of function(error, response)
     *
     * @return {Ticket}
     */
    sendMessage : function(body, ticketId, callback){

        //validating required parameters
        if (body == null || body == undefined){
            return callback({errorMessage: "The parameter 'body' is a required parameter and cannot be null.", errorCode:-1},null,null);
        } else if (ticketId == null || ticketId == undefined){
            return callback({errorMessage: "The parameter 'ticketId' is a required parameter and cannot be null.", errorCode:-1},null,null);
        }

        //prepare query string for API call;
        var _baseUri = _configuration.BASEURI;
        
        var _queryBuilder = _baseUri + "/tickets/{ticket_id}/message";
        
        //Process template parameters
        _queryBuilder = _APIHelper.appendUrlWithTemplateParameters(_queryBuilder, {
            "ticket_id" : ticketId
        });

        //validate and preprocess url
        var _queryUrl = _APIHelper.cleanUrl(_queryBuilder);
        
        //prepare headers
        var _headers = {
            "accept" : "application/json",
            "X-API-TOKEN" : _configuration.xAPITOKEN,
            "X-API-EMAIL" : _configuration.xAPIEMAIL
        };

        //prepare form data
        var _form = {
            "body" : body
        };

        //Remove null values
        _APIHelper.cleanObject(_form);

        //Construct the request
        var _options = {
            queryUrl: _queryUrl,
            method: "POST",
            headers: _headers,
            form : _form,
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
     * @param {string} ticketId    Required parameter: Example: 
     * @param {DateTime|null} interventionDate    Optional parameter: Example: 
     * @param {function} callback    Required parameter: Callback function in the form of function(error, response)
     *
     * @return {Ticket}
     */
    declareInterventionDone : function(ticketId, interventionDate, callback){

        //validating required parameters
        if (ticketId == null || ticketId == undefined){
            return callback({errorMessage: "The parameter 'ticketId' is a required parameter and cannot be null.", errorCode:-1},null,null);
        }

        //prepare query string for API call;
        var _baseUri = _configuration.BASEURI;
        
        var _queryBuilder = _baseUri + "/tickets/{ticket_id}/intervention_done";
        
        //Process template parameters
        _queryBuilder = _APIHelper.appendUrlWithTemplateParameters(_queryBuilder, {
            "ticket_id" : ticketId
        });

        //validate and preprocess url
        var _queryUrl = _APIHelper.cleanUrl(_queryBuilder);
        
        //prepare headers
        var _headers = {
            "accept" : "application/json",
            "X-API-TOKEN" : _configuration.xAPITOKEN,
            "X-API-EMAIL" : _configuration.xAPIEMAIL
        };

        //prepare form data
        var _form = {
            "intervention_date" : interventionDate
        };

        //Remove null values
        _APIHelper.cleanObject(_form);

        //Construct the request
        var _options = {
            queryUrl: _queryUrl,
            method: "POST",
            headers: _headers,
            form : _form,
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
     * The document should not be an invoice nor a quote
     * @param {string} file    Required parameter: Example: 
     * @param {string} ticketId    Required parameter: Example: 
     * @param {function} callback    Required parameter: Callback function in the form of function(error, response)
     *
     * @return {Ticket}
     */
    uploadDocument : function(file, ticketId, callback){

        //validating required parameters
        if (file == null || file == undefined){
            return callback({errorMessage: "The parameter 'file' is a required parameter and cannot be null.", errorCode:-1},null,null);
        } else if (ticketId == null || ticketId == undefined){
            return callback({errorMessage: "The parameter 'ticketId' is a required parameter and cannot be null.", errorCode:-1},null,null);
        }

        //prepare query string for API call;
        var _baseUri = _configuration.BASEURI;
        
        var _queryBuilder = _baseUri + "/tickets/{ticket_id}/document_upload";
        
        //Process template parameters
        _queryBuilder = _APIHelper.appendUrlWithTemplateParameters(_queryBuilder, {
            "ticket_id" : ticketId
        });

        //validate and preprocess url
        var _queryUrl = _APIHelper.cleanUrl(_queryBuilder);
        
        //prepare headers
        var _headers = {
            "accept" : "application/json",
            "X-API-TOKEN" : _configuration.xAPITOKEN,
            "X-API-EMAIL" : _configuration.xAPIEMAIL
        };

        //prepare form data
        var _formData = {
            "file" : file
        };

        //Remove null values
        _APIHelper.cleanObject(_formData);

        //Construct the request
        var _options = {
            queryUrl: _queryUrl,
            method: "POST",
            headers: _headers,
            formData : _formData,
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
     * @param {string} file    Required parameter: Example: 
     * @param {string} ticketId    Required parameter: Example: 
     * @param {function} callback    Required parameter: Callback function in the form of function(error, response)
     *
     * @return {Ticket}
     */
    uploadPicture : function(file, ticketId, callback){

        //validating required parameters
        if (file == null || file == undefined){
            return callback({errorMessage: "The parameter 'file' is a required parameter and cannot be null.", errorCode:-1},null,null);
        } else if (ticketId == null || ticketId == undefined){
            return callback({errorMessage: "The parameter 'ticketId' is a required parameter and cannot be null.", errorCode:-1},null,null);
        }

        //prepare query string for API call;
        var _baseUri = _configuration.BASEURI;
        
        var _queryBuilder = _baseUri + "/tickets/{ticket_id}/picture_upload";
        
        //Process template parameters
        _queryBuilder = _APIHelper.appendUrlWithTemplateParameters(_queryBuilder, {
            "ticket_id" : ticketId
        });

        //validate and preprocess url
        var _queryUrl = _APIHelper.cleanUrl(_queryBuilder);
        
        //prepare headers
        var _headers = {
            "accept" : "application/json",
            "X-API-TOKEN" : _configuration.xAPITOKEN,
            "X-API-EMAIL" : _configuration.xAPIEMAIL
        };

        //prepare form data
        var _formData = {
            "file" : file
        };

        //Remove null values
        _APIHelper.cleanObject(_formData);

        //Construct the request
        var _options = {
            queryUrl: _queryUrl,
            method: "POST",
            headers: _headers,
            formData : _formData,
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
     * @param {string} ticketId    Required parameter: Example: 
     * @param {function} callback    Required parameter: Callback function in the form of function(error, response)
     *
     * @return {Ticket}
     */
    get : function(ticketId, callback){

        //validating required parameters
        if (ticketId == null || ticketId == undefined){
            return callback({errorMessage: "The parameter 'ticketId' is a required parameter and cannot be null.", errorCode:-1},null,null);
        }

        //prepare query string for API call;
        var _baseUri = _configuration.BASEURI;
        
        var _queryBuilder = _baseUri + "/tickets/{ticket_id}";
        
        //Process template parameters
        _queryBuilder = _APIHelper.appendUrlWithTemplateParameters(_queryBuilder, {
            "ticket_id" : ticketId
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
        
    },


    /**
     * TODO: type endpoint description here
     * @param {string} file    Required parameter: Example: 
     * @param {string} ticketId    Required parameter: Example: 
     * @param {function} callback    Required parameter: Callback function in the form of function(error, response)
     *
     * @return {string}
     */
    uploadInvoice : function(file, ticketId, callback){

        //validating required parameters
        if (file == null || file == undefined){
            return callback({errorMessage: "The parameter 'file' is a required parameter and cannot be null.", errorCode:-1},null,null);
        } else if (ticketId == null || ticketId == undefined){
            return callback({errorMessage: "The parameter 'ticketId' is a required parameter and cannot be null.", errorCode:-1},null,null);
        }

        //prepare query string for API call;
        var _baseUri = _configuration.BASEURI;
        
        var _queryBuilder = _baseUri + "/tickets/{ticket_id}/invoice_upload";
        
        //Process template parameters
        _queryBuilder = _APIHelper.appendUrlWithTemplateParameters(_queryBuilder, {
            "ticket_id" : ticketId
        });

        //validate and preprocess url
        var _queryUrl = _APIHelper.cleanUrl(_queryBuilder);
        
        //prepare headers
        var _headers = {
            "X-API-TOKEN" : _configuration.xAPITOKEN,
            "X-API-EMAIL" : _configuration.xAPIEMAIL
        };

        //prepare form data
        var _formData = {
            "file" : file
        };

        //Remove null values
        _APIHelper.cleanObject(_formData);

        //Construct the request
        var _options = {
            queryUrl: _queryUrl,
            method: "POST",
            headers: _headers,
            formData : _formData,
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
        
    }

};

module.exports = TicketController;