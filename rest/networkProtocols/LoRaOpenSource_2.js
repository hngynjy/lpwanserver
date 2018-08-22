var request = require('request')
var nconf = require('nconf')

// General libraries in use in this module.
var appLogger = require('../lib/appLogger.js')

/**
 * The Lora Open Source Protocol Handler Module
 * @module networkProtocols/LoraOpenSource
 * @see module:networkProtocols/networkProtocols
 * @type {{activeApplicationNetworkProtocols: {}}}
 */
module.exports = {}

module.exports.activeApplicationNetworkProtocols = {}
module.exports.metaData =
  {
    protocolHandlerName: 'Lora Open Source',
    version:
      {
        versionText: 'Version 2.0',
        versionValue: '2.0'
      },
    networkType: 'Lora',
    oauthUrl: '',
    protocolHandlerNetworkFields: [
      {
        name: 'username',
        description: 'The username of the LoraOS admin account',
        help: '',
        type: 'string',
        label: 'Username',
        value: '',
        required: true,
        placeholder: 'myLoraUsername',
        oauthQueryParameter: ''
      },
      {
        name: 'password',
        description: 'The password of he LoraOS admin account',
        help: '',
        type: 'password',
        label: 'Password',
        value: '',
        required: true,
        placeholder: 'myLoraPassword',
        oauthQueryParameter: ''
      }
    ]
  }

module.exports.register = async function (networkProtocols) {
  appLogger.log('Lora Open Source 2:register')
  return new Promise(async function (resolve, reject) {
    let me = {
      name: 'Lora Open Source',
      networkTypeId: 1,
      protocolHandler: 'LoRaOpenSource_2.js',
      networkProtocolVersion: '2.0'
    }
    networkProtocols.retrieveNetworkProtocols({search: me.name, networkProtocolVersion: '1.0'})
      .then(master => {
        me.masterProtocol = master.records[0].id
        networkProtocols.upsertNetworkProtocol(me)
          .then(() => {
            resolve()
          })
          .catch(err => {
            reject(err)
          })
      })
      .catch(err => {
        console.log(err)
      })
  })
}

/**
 * Test the network to verify it functions correctly.
 *
 * @param network - network to test
 * @param loginData - credentials
 * @returns {Promise<any>}
 */
module.exports.test = function (network, loginData) {
  return new Promise(function (resolve, reject) {
    appLogger.log(network.securityData)
    if (network.securityData.authorized) {
      let options = {}
      options.method = 'GET'
      options.url = network.baseUrl + '/applications' + '?limit=1&offset=0'
      options.headers = {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + network.securityData.access_token
      }
      options.agentOptions = {
        'secureProtocol': 'TLSv1_2_method',
        'rejectUnauthorized': false
      }
      options.json = true
      request(options, function (error, response, body) {
        if (!error) {
          if (response.statusCode === 401) {
            reject(new Error('Unauthorized'))
          }
          else if (response.statusCode === 404) {
            reject(new Error('URL is Incorrect'))
          }
          else if (response.statusCode >= 400) {
            appLogger.log(body)
            reject(new Error('Server Error'))
          }
          else {
            resolve(body)
          }
        }
        else {
          appLogger.log('Test Error: ' + error)
          if (response && response.statusCode) {
            appLogger.log(response.statusCode)
          }
          reject(error)
        }
      })
    }
    else {
      reject(new Error('Not Authorized'))
    }
  })
}

//* *****************************************************************************
// Maps the standard remote network API to the LoRaOpenSource server.
// This is a cross-platform API that must remain consistent.
//* *****************************************************************************

// The login account data needed to manipulate companies.
//
// dataAPI - The API that handles common data access and manipulation functions
//           on behalf of the protocol.
// network - The network that we are to get the company account info for.  For
//           LoRa Open Source, this is a global admin account.
module.exports.getCompanyAccessAccount = async function (dataAPI, network) {
  let secData = network.securityData
  if (!secData || !secData.username || !secData.password) {
    appLogger.log('Network security data is incomplete for ' + network.name)
    dataAPI.addLog(network, 'Network security data is incomplete for ' + network.name)
    return null
  }
  return {
    username: secData.username,
    password: secData.password,
    admin: true
  }
}

// The login account data needed to manipulate applications.  For LoRa Open
// Source, this is the company admin account.
//
// dataAPI       - The API that handles common data access and manipulation
//                 functions on behalf of the protocol.
// network - The network that we are to get the application account info for.
//           For LoRa Open Source, this is a company account.
// applicationId - The id of the local application record, used to get to the
//                 company.
module.exports.getApplicationAccessAccount = async function (dataAPI, network, applicationId) {
  // Get the company for this application.
  var co = await dataAPI.getCompanyByApplicationId(applicationId)

  // Return the account info.  Don't generate a new account - it must already
  // be there.
  return getCompanyAccount(dataAPI, network, co.id, false)
}

// The login account data needed to manipulate devices.  For LoRa Open
// Source, this is th  appLogger.log(secData)
//
// dataAPI  - The API that handles common data access and manipulation
//            functions on behalf of the protocol.
// network  - The network that we are to get the application account info for.
//            For LoRa Open Source, this is a company account.
// deviceId - The id of the local device record, used to get to the
//            company.
module.exports.getDeviceAccessAccount = async function (dataAPI, network, deviceId) {
  // Get the company for this device.
  var co = await dataAPI.getCompanyByDeviceId(deviceId)

  // Return the account info.  Don't generate a new account - it must already
  // be there.
  return getCompanyAccount(dataAPI, network, co.id, false)
}

// The login account data needed to manipulate deviceProfiles.  For LoRa Open
// Source, this is the company admin account.
//
// dataAPI         - The API that handles common data access and manipulation
//                   functions on behalf of the protocol.
// network         - The network that we are to get the application account info
//                   for. For LoRa Open Source, this is a company account.
// deviceProfileId - The id of the local device record, used to get to the
//                   company.
module.exports.getDeviceProfileAccessAccount = async function (dataAPI, network, deviceId) {
  // Get the company for this device.
  var co = await dataAPI.getCompanyByDeviceProfileId(deviceId)

  // Return the account info.  Don't generate a new account - it must already
  // be there.
  return getCompanyAccount(dataAPI, network, co.id, false)
}

// The company admin account data for the company on the network, used to set up
// applications and devices.  If the account data does not exist, this code
// can optionally generate it.
async function getCompanyAccount (dataAPI, network, companyId, generateIfMissing) {
  // Obtain the security data from the protocol storage in the dataAPI, then
  // access it for the user.
  var srd
  var kd
  var secData
  try {
    srd = await dataAPI.getProtocolDataForKey(
      network.id,
      network.networkProtocolId,
      makeCompanyDataKey(companyId, 'sd'))

    kd = await dataAPI.getProtocolDataForKey(
      network.id,
      network.networkProtocolId,
      makeCompanyDataKey(companyId, 'kd'))
  }
  catch (err) {
    // Something's off.  Generate new if allowed.
    if (generateIfMissing) {
      appLogger.log('Generating account for ' + companyId)
      // Take the company name, make it suitable for a user name, and then
      // add "admin" for the username.
      var corec = await dataAPI.getCompanyById(companyId)
      var uname = corec.name.replace(/[^a-zA-Z0-9]/g, '')
      uname += 'admin'
      var pass = await dataAPI.genPass()
      kd = await dataAPI.genKey()
      secData = {'username': uname, 'password': pass}
      srd = dataAPI.hide(network, secData, kd)
      appLogger.log(uname)
      appLogger.log(pass)

      // Save for future reference.networkId, networkProtocolId, key, data
      await dataAPI.putProtocolDataForKey(
        network.id,
        network.networkProtocolId,
        makeCompanyDataKey(companyId, 'sd'),
        srd)

      await dataAPI.putProtocolDataForKey(
        network.id,
        network.networkProtocolId,
        makeCompanyDataKey(companyId, 'kd'),
        kd)
      return secData
    }
    else {
      dataAPI.addLog(network, JSON.stringify(err))
      dataAPI.addLog(network,
        'LoraOS: Company security data is missing for company id ' +
        companyId)
      return null
    }
  }

  try {
    secData = await dataAPI.access(network, srd, kd)
  }
  catch (err) {
    return null
  }

  if (!secData.username || !secData.password) {
    dataAPI.addLog(network,
      'Company security data is incomplete for company id ' +
      companyId)
    return null
  }

  return secData
};

function makeNetworkDataKey (networkId, dataName) {
  return 'nwk:' + networkId + '/' + dataName
}

function makeCompanyDataKey (companyId, dataName) {
  return 'co:' + companyId + '/' + dataName
}

function makeApplicationDataKey (applicationId, dataName) {
  return 'app:' + applicationId + '/' + dataName
}

function makeDeviceDataKey (deviceId, dataName) {
  return 'dev:' + deviceId + '/' + dataName
}

function makeDeviceProfileDataKey (deviceProfileId, dataName) {
  return 'dp:' + deviceProfileId + '/' + dataName
}

// Creating a ServiceProfile requires a NetworkServerId.  However, that's pretty
// esoteric concept for general application management, so we provide this
// method that will get a network server id from the LoRa system.
function getANetworkServerID (network, connection) {
  appLogger.log('LoRaOpenSource: getANetworkServerID')
  return new Promise(async function (resolve, reject) {
    // Set up the request options.
    var options = {}
    options.method = 'GET'
    // options.url = network.baseUrl + "/network-servers?limit=1&offset=0";
    options.url = network.baseUrl + '/network-servers?limit=20&offset=0'
    options.headers = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + connection
    }
    options.agentOptions = {
      'secureProtocol': 'TLSv1_2_method',
      'rejectUnauthorized': false
    }

    request(options, async function (error, response, body) {
      if (error || response.statusCode >= 400) {
        if (error) {
          dataAPI.addLog(network, 'Error on get Network Server: ' + error)
          reject(error)
        }
        else {
          var bodyObj = JSON.parse(response.body)
          dataAPI.addLog(network, 'Error on get Network Server: ' +
            bodyObj.error +
            ' (' + response.statusCode + ')')
          dataAPI.addLog(network, 'Request data = ' + JSON.stringify(options))
          reject(response.statusCode)
        }
      }
      else {
        // Convert text to JSON array, use id from first element
        var res = JSON.parse(body)
        var nsList = res.result
        if (nsList.length == 0) {
          dataAPI.addLog(network, 'Empty list of Network Servers returned')
          reject(404)
          return
        }
        appLogger.log(nsList)
        resolve(nsList[0].id)
      }
    })
  })
}

// Get the NetworkServer using the Service Profile a ServiceProfile.
function getNetworkServerById (network, networkServerId, connection, dataAPI) {
  appLogger.log('LoRaOpenSource: getNetworkServerForRemoteOrganization')
  return new Promise(async function (resolve, reject) {
    // Set up the request options.
    var options = {}
    options.method = 'GET'
    options.url = network.baseUrl + '/network-servers/' + networkServerId
    options.headers = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + connection
    }
    options.agentOptions = {
      'secureProtocol': 'TLSv1_2_method',
      'rejectUnauthorized': false
    }

    request(options, async function (error, response, body) {
      if (error || response.statusCode >= 400) {
        if (error) {
          dataAPI.addLog(network, 'Error on get Network Server: ' + error)
          reject(error)
        }
        else {
          var bodyObj = JSON.parse(response.body)
          dataAPI.addLog(network, 'Error on get Network Server: ' +
            bodyObj.error +
            ' (' + response.statusCode + ')')
          dataAPI.addLog(network, 'Request data = ' + JSON.stringify(options))
          reject(response.statusCode)
        }
      }
      else {
        // Convert text to JSON array, use id from first element
        var res = JSON.parse(body)
        appLogger.log(res)
        resolve(res)
      }
    })
  })
};

// Get the NetworkServer using the Service Profile a ServiceProfile.
function getDeviceProfileById (network, dpId, connection, dataAPI) {
  appLogger.log('LoRaOpenSource: getDeviceProfileById')
  return new Promise(async function (resolve, reject) {
    // Set up the request options.
    var options = {}
    options.method = 'GET'
    options.url = network.baseUrl + '/device-profiles/' + dpId
    options.headers = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + connection
    }
    options.agentOptions = {
      'secureProtocol': 'TLSv1_2_method',
      'rejectUnauthorized': false
    }
    appLogger.log(options)
    request(options, async function (error, response, body) {
      if (error || response.statusCode >= 400) {
        if (error) {
          dataAPI.addLog(network, 'Error on get Device Profile: ' + error)
          reject(error)
        }
        else {
          var bodyObj = JSON.parse(response.body)
          appLogger.log(bodyObj)
          appLogger.log(options)
          dataAPI.addLog(network, 'Error on get Device Profile: ' +
            bodyObj.error +
            ' (' + response.statusCode + ')')
          dataAPI.addLog(network, 'Request data = ' + JSON.stringify(options))
          reject(response.statusCode)
        }
      }
      else {
        // Convert text to JSON array, use id from first element
        var res = JSON.parse(body)
        appLogger.log(res)
        resolve(res)
      }
    })
  })
};

// Get the NetworkServer using the Service Profile a ServiceProfile.
function getDeviceById (network, deviceId, connection, dataAPI) {
  appLogger.log('LoRaOpenSource: getDeviceProfileById')
  return new Promise(async function (resolve, reject) {
    // Set up the request options.
    var options = {}
    options.method = 'GET'
    options.url = network.baseUrl + '/devices/' + deviceId
    options.headers = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + connection
    }
    options.agentOptions = {
      'secureProtocol': 'TLSv1_2_method',
      'rejectUnauthorized': false
    }
    appLogger.log(options)
    request(options, async function (error, response, body) {
      if (error || response.statusCode >= 400) {
        if (error) {
          dataAPI.addLog(network, 'Error on get Device: ' + error)
          reject(error)
        }
        else {
          var bodyObj = JSON.parse(response.body)
          dataAPI.addLog(network, 'Error on get Device: ' +
            bodyObj.error +
            ' (' + response.statusCode + ')')
          dataAPI.addLog(network, 'Request data = ' + JSON.stringify(options))
          reject(response.statusCode)
        }
      }
      else {
        // Convert text to JSON array, use id from first element
        var res = JSON.parse(body)
        appLogger.log(res)
        resolve(res)
      }
    })
  })
};

// Get the NetworkServer using the Service Profile a ServiceProfile.
function getServiceProfileById (network, serviceProfileId, connection, dataAPI) {
  appLogger.log('LoRaOpenSource: getServiceProfileById')
  return new Promise(async function (resolve, reject) {
    // Set up the request options.
    var options = {}
    options.method = 'GET'
    options.url = network.baseUrl + '/service-profiles/' + serviceProfileId
    options.headers = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + connection
    }
    options.agentOptions = {
      'secureProtocol': 'TLSv1_2_method',
      'rejectUnauthorized': false
    }

    request(options, async function (error, response, body) {
      if (error || response.statusCode >= 400) {
        if (error) {
          dataAPI.addLog(network, 'Error on get Service Profile: ' + error)
          reject(error)
        }
        else {
          var bodyObj = JSON.parse(response.body)
          dataAPI.addLog(network, 'Error on get Service Profile: ' +
            bodyObj.error +
            ' (' + response.statusCode + ')')
          dataAPI.addLog(network, 'Request data = ' + JSON.stringify(options))
          reject(response.statusCode)
        }
      }
      else {
        // Convert text to JSON array, use id from first element
        var res = JSON.parse(body)
        appLogger.log(res)
        resolve(res)
      }
    })
  })
}

// Get the NetworkServer using the Service Profile a ServiceProfile.
function getApplicationById (network, applicationId, connection, dataAPI) {
  appLogger.log('LoRaOpenSource: getApplicationById')
  return new Promise(async function (resolve, reject) {
    // Set up the request options.
    var options = {}
    options.method = 'GET'
    options.url = network.baseUrl + '/applications/' + applicationId
    options.headers = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + connection
    }
    options.agentOptions = {
      'secureProtocol': 'TLSv1_2_method',
      'rejectUnauthorized': false
    }

    appLogger.log(options)
    request(options, async function (error, response, body) {
      if (error || response.statusCode >= 400) {
        if (error) {
          dataAPI.addLog(network, 'Error on get Application: ' + error)
          reject(error)
        }
        else {
          var bodyObj = JSON.parse(response.body)
          dataAPI.addLog(network, 'Error on get Application: ' +
            bodyObj.error +
            ' (' + response.statusCode + ')')
          dataAPI.addLog(network, 'Request data = ' + JSON.stringify(options))
          reject(response.statusCode)
        }
      }
      else {
        // Convert text to JSON array, use id from first element
        var res = JSON.parse(body)
        appLogger.log(res)
        resolve(res)
      }
    })
  })
}

// Get the Service Profile a for a Remote Org.
function getServiceProfileForOrg (network, orgId, companyId, connection, dataAPI) {
  appLogger.log('LoRaOpenSource: getNetworkServerForRemoteOrganization')
  return new Promise(async function (resolve, reject) {
    var spOptions = {}
    spOptions.method = 'GET'
    spOptions.url = network.baseUrl + '/service-profiles?organizationID=' + orgId + '&limit=20&offset=0'
    spOptions.headers = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + connection
    }

    spOptions.agentOptions = {
      'secureProtocol': 'TLSv1_2_method',
      'rejectUnauthorized': false
    }
    appLogger.log(spOptions)
    request(spOptions, async function (error, response, body) {
      if (error || response.statusCode >= 400) {
        if (error) {
          dataAPI.addLog(network, 'Error getting Service Profile: ' + error)
          reject(error)
        }
        else {
          dataAPI.addLog(network, 'Error getting Service Profile: ' + response.statusCode +
            ' (Server message: ' + response.body.error + ')')
          reject(response.statusCode)
        }
      }
      else {
        // Save the ServiceProfile ID from the remote
        // network.
        body = JSON.parse(body)
        appLogger.log(body)
        if (body.totalCount == 0) {
          // no SP to get
          resolve()
        }
        else {
          let serviceProfile = body.result[0]
          await dataAPI.putProtocolDataForKey(
            network.id,
            network.networkProtocolId,
            makeCompanyDataKey(companyId, 'coSPId'),
            serviceProfile.serviceProfileID)
          // TODO: Remove this HACK.  Should not store the service profile locally
          //       in case it gets changed on the remote server.
          await dataAPI.putProtocolDataForKey(
            network.id,
            network.networkProtocolId,
            makeCompanyDataKey(companyId, 'coSPNwkId'),
            serviceProfile.networkServerID)
          resolve(serviceProfile)
        }
      }
    }) // End of service profile create
  })
}

// Creating a DeviceProfile requires a NetworkServerId.  However, you can't get
// data from that table in LoRa if you aren't a Global Admin.  So get the
// company's ServiceProfile and get it from that.
function getANetworkServerIDFromServiceProfile (network, connection, coId, dataAPI) {
  return new Promise(async function (resolve, reject) {
    var coSPId
    try {
      coSPId = await dataAPI.getProtocolDataForKey(
        network.id,
        network.networkProtocolId,
        makeCompanyDataKey(coId, 'coSPId'))
    }
    catch (err) {
      dataAPI.addLog(network, 'Error on getting Service Profile Id: ' + err)
      reject(err)
      return
    }

    // TODO: FIX THIS HACK.  Storing the network ID locally is bad, in case the
    //       service for the company is changes on the remote LoRa system.

    try {
      var coSPNwkId = await dataAPI.getProtocolDataForKey(
        network.id,
        network.networkProtocolId,
        makeCompanyDataKey(coId, 'coSPNwkId'))
      resolve(coSPNwkId)
    }
    catch (err) {
      dataAPI.addLog(network, "Error on getting Service Profile's Network's Id: " + err)
      reject(err)
    }

    /* The loraserver is failing to load the serviceprofile, and passes that back
   to us as a 500 error, causing all kinds of mayhem.  The hack above bypasses
   this problem.
        // Set up the request options.
        var options = {};
        options.method = 'GET';
        options.url = network.baseUrl + "/service-profiles/" + coSPId;
        options.headers = { "Content-Type": "application/json",
                            "Authorization": "Bearer " + connection };
        options.agentOptions = {
            "secureProtocol": "TLSv1_2_method",
            "rejectUnauthorized": false };

        request( options, async function( error, response, body ) {
            var bodyObj;
            if ( typeof body === 'object' ) {
                bodyObj = body;
            }
            else {
                bodyObj = JSON.parse( response.body );
            }
            if ( error || response.statusCode >= 400 ) {
                if ( error ) {
                    dataAPI.addLog( network, "Error on get Service Profile: " + error );
                    reject( error );
                    return;
                }
                else {
                    dataAPI.addLog( network, "Error on get Service Profile: " +
                                  bodyObj.error +
                                   " (" + response.statusCode + ")" );
                    reject( response.statusCode );
                    return;
                }
            }
            else {
                // Return the networkServerId from the returned object.
                resolve( bodyObj.networkServerID );
            }
        });
        */
  })
}

//* *****************************************************************************
// Login/logout
//* *****************************************************************************

// Connect with the remote system.
//
// network     - The networks record for the network that uses this
//               protocol.
// loginData   - The companyNetworkTypeLinks record for this company and network.
//
// Returns a Promise that connects to the remote system.  We treat all
// connections like a login session, and it is up to the code in this module
// to implement that concept.  The promise returns the opaque session data to
// be passed into other methods.
module.exports.connect = function (network, loginData) {
  return new Promise(function (resolve, reject) {
    // Set up the request options.
    var options = {}
    options.method = 'POST'
    options.url = network.baseUrl + '/internal/login'
    options.headers = {'Content-Type': 'application/json'}
    options.json = loginData
    options.agentOptions = {'secureProtocol': 'TLSv1_2_method', 'rejectUnauthorized': false}
    request(options, function (error, response, body) {
      if (error) {
        appLogger.log('Error on signin: ' + error)
        reject(error)
      }
      else if (response.statusCode >= 400 || response.statusCode === 301) {
        appLogger.log('Error on signin: ' + response.statusCode + ', ' + response.body.error)
        reject(response.statusCode)
      }
      else {
        var token = body.jwt
        if (token) {
          resolve(token)
        }
        else {
          reject(new Error('Server Error'))
        }
      }
    })
  })
}

// Disconnect with the remote system.
//
// connection - The data top use to drop the connection
//
// Returns a Promise that disconnects from the remote system.
module.exports.disconnect = function (connection) {
  return new Promise(function (resolve, reject) {
    // LoRa app server doesn't have a logout.  Just clear the token.
    connection = null
    resolve()
  })
}

//* *****************************************************************************
// CRUD companies.
//* *****************************************************************************

// Add company.
//
// sessionData     - The session information for the user, including the //                   connection data for the remote system.
// network         - The networks record for the network that uses this
//                   protocol.
// companyId       - The companyNetworkTypeLinks record id for this company and
//                   network.
// dataAPI         - Gives access to the data records and error tracking for the
//                   operation.
//
// Returns a Promise that connects to the remote system and creates the
// company.  The promise saves the id for the remote company, linked to the
// local database record.  This method is called in an async manner against
// lots of other networks, so logging should be done via the dataAPI.
module.exports.addCompany = function (sessionData, network, companyId, dataAPI) {
  return new Promise(async function (resolve, reject) {
    // Get the application data.
    var company
    try {
      company = await dataAPI.getCompanyById(companyId)
    }
    catch (err) {
      reject(err)
      return
    }

    // Set up the request options.
    var options = {}
    options.method = 'POST'
    options.url = network.baseUrl + '/organizations'
    options.headers = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + sessionData.connection
    }
    // No need to allow gateways on organizations we create (may be changed
    // locally by network admin, and that's fine - just start w/o gateways).
    options.json = {
      'name': company.name,
      'displayName': company.name,
      'canHaveGateways': false
    }
    options.agentOptions = {
      'secureProtocol': 'TLSv1_2_method',
      'rejectUnauthorized': false
    }

    request(options, async function (error, response, body) {
      if (error || response.statusCode >= 400) {
        if (error) {
          dataAPI.addLog(network, 'Error on create company ' + company.name + ': ' + error)
          reject(error)
        }
        else {
          dataAPI.addLog(network, 'Error on create company ' + company.name +
            ': ' + response.statusCode)
          reject(response.statusCode)
        }
      }
      else {
        try {
          // Save the company ID from the remote network.
          await dataAPI.putProtocolDataForKey(network.id,
            network.networkProtocolId,
            makeCompanyDataKey(company.id, 'coNwkId'),
            body.id)
          var networkCoId = body.id

          // We will need an admin user for this company.
          var userOptions = {}
          userOptions.method = 'POST'
          userOptions.url = network.baseUrl + '/users'
          userOptions.headers = {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + sessionData.connection
          }

          // Get/generate the company username/password
          var creds = await getCompanyAccount(dataAPI, network, companyId, true)

          userOptions.json = {
            'username': creds.username,
            'password': creds.password,
            'isActive': true,
            'isAdmin': false,
            'sessionTTL': 0,
            'organizations': [
              {
                'isAdmin': true,
                'organizationID': networkCoId
              }
            ],
            'email': 'fake@emailaddress.com',
            'note': 'Created by and for LPWAN Server'
          }
          userOptions.agentOptions = {
            'secureProtocol': 'TLSv1_2_method',
            'rejectUnauthorized': false
          }

          request(userOptions, async function (error, response, body) {
            if (error || response.statusCode >= 400) {
              if (error) {
                dataAPI.addLog(network, 'Error creating ' + company.name +
                  "'s admin user " + userOptions.json.username +
                  ': ' + error)
                reject(error)
                return
              }
              else {
                dataAPI.addLog(network, 'Error creating ' + company.name +
                  "'s admin user " + userOptions.json.username +
                  ': ' + response.statusCode +
                  ' (Server message: ' + response.body.error + ')')
                reject(response.statusCode)
                return
              }
            }
            else {
              // Save the user ID from the remote network.
              await dataAPI.putProtocolDataForKey(network.id,
                network.networkProtocolId,
                makeCompanyDataKey(company.id, 'coUsrId'),
                body.id)
            }

            // Set up a default Service Profile.
            var networkServerId = await getANetworkServerID(network, sessionData.connection)

            var spOptions = {}
            spOptions.method = 'POST'
            spOptions.url = network.baseUrl + '/service-profiles'
            spOptions.headers = {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + sessionData.connection
            }

            spOptions.json = {
              'name': 'defaultForLPWANServer',
              'networkServerID': networkServerId,
              'organizationID': networkCoId,
              'serviceProfile': {
                'addGWMetadata': true,
                'devStatusReqFreq': 1,
                'dlBucketSize': 0,
                'ulRate': 100000,
                'dlRate': 100000,
                'dlRatePolicy': 'DROP',
                'ulRatePolicy': 'DROP',
                'drMax': 3,
                'drMin': 0,
                'reportDevStatusBattery': true,
                'reportDevStatusMargin': true
              }
            }
            spOptions.agentOptions = {
              'secureProtocol': 'TLSv1_2_method',
              'rejectUnauthorized': false
            }
            request(spOptions, async function (error, response, body) {
              if (error || response.statusCode >= 400) {
                if (error) {
                  dataAPI.addLog(network, 'Error creating default Service Profile: ' + error)
                  reject(error)
                }
                else {
                  dataAPI.addLog(network, 'Error creating default Service Profile: ' + response.statusCode +
                    ' (Server message: ' + response.body.error + ')')
                  reject(response.statusCode)
                }
              }
              else {
                // Save the ServiceProfile ID from the remote
                // network.
                await dataAPI.putProtocolDataForKey(
                  network.id,
                  network.networkProtocolId,
                  makeCompanyDataKey(company.id, 'coSPId'),
                  body.serviceProfileID)
                // TODO: Remove this HACK.  Should not store the service profile locally
                //       in case it gets changed on the remote server.
                await dataAPI.putProtocolDataForKey(
                  network.id,
                  network.networkProtocolId,
                  makeCompanyDataKey(company.id, 'coSPNwkId'),
                  networkServerId)
                resolve()
              }
            }) // End of service profile create
          }) // End of user create request.
        }
        catch (err) {
          dataAPI.addLog(network, 'Failed to add ancillary data to remote host: ' + err)
          reject(err)
        }
      }
    })
  })
}

// Get company.
//
// sessionData - The session information for the user, including the //               connection data for the remote system.
// network     - The networks record for the network that uses this
//               protocol.
// companyId   - The id for the local company data, for which the remote data
//               will be retrieved.
// dataAPI     - Gives access to the data records and error tracking for the
//               operation.
//
// Returns a Promise that gets the company record from the remote system.
module.exports.getCompany = function (sessionData, network, companyId, dataAPI) {
  return new Promise(async function (resolve, reject) {
    // Get the remote company id.
    var coid
    var company
    try {
      company = await dataAPI.getCompanyById(companyId)
      coid = await dataAPI.getProtocolDataForKey(
        network.id,
        network.networkProtocolId,
        makeCompanyDataKey(company.id, 'coNwkId'))
    }
    catch (err) {
      // No data.
      dataAPI.addLog(network, 'Company ' + company.name +
        ' does not have a key for the remote network.  Company has not yet been created.')
      reject(err)
    }

    // Set up the request options.
    var options = {}
    options.method = 'GET'
    options.url = network.baseUrl + '/organizations/' + coid
    options.headers = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + sessionData.connection
    }
    options.agentOptions = {
      'secureProtocol': 'TLSv1_2_method',
      'rejectUnauthorized': false
    }

    request(options, function (error, response, body) {
      if (error) {
        dataAPI.addLog(network, 'Error getting company ' + company.name + ': ' + error)
        reject(error)
      }
      else {
        resolve(body)
      }
    })
  })
}

// Update company.
//
// sessionData - The session information for the user, including the //               connection data for the remote system.
// network     - The networks record for the network that uses this
//               protocol.
// companyId   - The id for the local company data, from which the remote data
//               will be updated.
// dataAPI     - Gives access to the data records and error tracking for the
//               operation.
//
// Returns a Promise that gets the company record from the remote system.
module.exports.updateCompany = function (sessionData, network, companyId, dataAPI) {
  return new Promise(async function (resolve, reject) {
    // Get the remote company id.
    var coid
    var company
    try {
      company = await dataAPI.getCompanyById(companyId)
      coid = await dataAPI.getProtocolDataForKey(
        network.id,
        network.networkProtocolId,
        makeCompanyDataKey(company.id, 'coNwkId'))
    }
    catch (err) {
      // No data.
      dataAPI.addLog(network, 'Company ' + company.name +
        ' does not have a key for the remote network.  Company has not yet been created.')
      reject(err)
    }

    // Set up the request options.
    var options = {}
    options.method = 'PUT'
    options.url = network.baseUrl + '/organizations/' + coid
    options.headers = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + sessionData.connection
    }
    options.json = {
      'name': company.name,
      'displayName': company.name,
      'organizationID': coid
    }
    options.agentOptions = {
      'secureProtocol': 'TLSv1_2_method',
      'rejectUnauthorized': false
    }

    request(options, function (error, response, body) {
      if (error) {
        dataAPI.addLog(network, 'Error updating company ' + company.name +
          ': ' + error)
        reject(error)
      }
      else {
        resolve()
      }
    })
  })
}

// Delete the company.
//
// sessionData - The session information for the user, including the connection
//               data for the remote system.
// network     - The networks record for the network that uses this protocol.
// companyId   - The company to be deleted on the remote system.
// dataAPI     - Gives access to the data records and error tracking for the
//               operation.
//
// Returns a Promise that deletes the company record from the remote system.
module.exports.deleteCompany = function (sessionData, network, companyId, dataAPI) {
  return new Promise(async function (resolve, reject) {
    // Get the remote company id.
    var coid
    var userId
    try {
      coid = await dataAPI.getProtocolDataForKey(
        network.id,
        network.networkProtocolId,
        makeCompanyDataKey(companyId, 'coNwkId'))

      // Get the admin user's id, too.
      userId = await dataAPI.getProtocolDataForKey(
        network.id,
        network.networkProtocolId,
        makeCompanyDataKey(companyId, 'coUsrId'))
    }
    catch (err) {
      // No data.
      dataAPI.addLog(network, 'Company ' + companyId +
        ' does not have a key for the remote network.  Company has not yet been created.')
      reject(err)
      return
    }

    // Set up the request options to delete the user first.
    var userOptions = {}
    userOptions.method = 'DELETE'
    userOptions.url = network.baseUrl + '/users/' + userId
    userOptions.headers = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + sessionData.connection
    }
    userOptions.agentOptions = {
      'secureProtocol': 'TLSv1_2_method',
      'rejectUnauthorized': false
    }
    request(userOptions, function (error, response, body) {
      if (error) {
        dataAPI.addLog(network, "Error on delete company's admin user: " + error)
        reject(error)
      }
      else {
        // Set up the request options to delete the company.
        var options = {}
        options.method = 'DELETE'
        options.url = network.baseUrl + '/organizations/' + coid
        options.headers = {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + sessionData.connection
        }
        options.agentOptions = {
          'secureProtocol': 'TLSv1_2_method',
          'rejectUnauthorized': false
        }

        request(options, async function (error, response, body) {
          if (error) {
            dataAPI.addLog(network, 'Error on delete company: ' + error)
            reject(error)
          }
          else {
            // Clear the data for this company from the
            // protocolData store.
            await dataAPI.deleteProtocolDataForKey(
              network.id,
              network.networkProtocolId,
              makeCompanyDataKey(companyId, 'kd'))
            await dataAPI.deleteProtocolDataForKey(
              network.id,
              network.networkProtocolId,
              makeCompanyDataKey(companyId, 'coUsrId'))

            await dataAPI.deleteProtocolDataForKey(
              network.id,
              network.networkProtocolId,
              makeCompanyDataKey(companyId, 'coNwkId'))
            await dataAPI.deleteProtocolDataForKey(
              network.id,
              network.networkProtocolId,
              makeCompanyDataKey(companyId, 'sd'))
            await dataAPI.deleteProtocolDataForKey(
              network.id,
              network.networkProtocolId,
              makeCompanyDataKey(companyId, 'coSPId'))
            // TODO: Remove this HACK.  Should not store the
            // service profile locally in case it gets changed on
            // the remote server.
            await dataAPI.deleteProtocolDataForKey(
              network.id,
              network.networkProtocolId,
              makeCompanyDataKey(companyId, 'coSPNwkId'))
            resolve()
          }
        })
      }
    })
  })
}

// Push the company, meaning update if it exists, and create if it doesn't.
//
// sessionData - The session information for the user, including the connection
//               data for the remote system.
// network     - The networks record for the network that uses this protocol.
// companyId   - The company to be deleted on the remote system.
// dataAPI     - Gives access to the data records and error tracking for the
//               operation.
//
// Returns a Promise that pushes the company record to the remote system.
module.exports.pushCompany = function (sessionData, network, companyId, dataAPI) {
  return new Promise(async function (resolve, reject) {
    // Try a "get" to see if the company ia already there.
    var co
    try {
      co = await module.exports.getCompany(sessionData, network, companyId, dataAPI)
    }
    catch (err) {
      if (err == 404) {
        // Need to create, then.
        var coid
        try {
          coid = await module.exports.addCompany(sessionData, network, companyId, dataAPI)
          resolve(coid)
        }
        catch (err) {
          dataAPI.addLog(network, 'Error on push company (create): ' + err)
          reject(err)
        }
        return
      }
    }

    // Get worked - do an update.
    try {
      await module.exports.updateCompany(sessionData, network, companyId, dataAPI)
    }
    catch (err) {
      dataAPI.addLog(network, 'Error on push company (update): ' + err)
      reject(err)
      return
    }
    resolve()
  })
}

// Get company.
//
// sessionData - The session information for the user, including the //               connection data for the remote system.
// network     - The networks record for the network that uses this
//               protocol.
// companyId   - The id for the local company data, for which the remote data
//               will be retrieved.
// dataAPI     - Gives access to the data records and error tracking for the
//               operation.
//
// Returns a Promise that gets the company record from the remote system.
module.exports.pullNetwork = function (sessionData, network, dataAPI, modelAPI) {
  let me = this
  return new Promise(async function (resolve, reject) {
    me.pullCompanies(sessionData, network, dataAPI, modelAPI)
      .then((companyMap) => {
        appLogger.log('Success in pulling organizations from ' + network.name)
        appLogger.log(companyMap)
        me.pullDeviceProfiles(sessionData, network, companyMap, dataAPI, modelAPI)
          .then((dpMap) => {
            appLogger.log('Success in pulling device profiles from ' + network.name)
            appLogger.log(dpMap)

            me.pullApplications(sessionData, network, companyMap, dpMap, dataAPI, modelAPI)
              .then((applicationMap) => {
                appLogger.log('Success in pulling applications from ' + network.name)
                appLogger.log(applicationMap)
                // me.pullDevices(sessionData, network, companyMap, applicationMap, dpMap, dataAPI, modelAPI)
                //     .then((result) => {
                //         appLogger.log('Success in pulling devices from ' + network.name);
                //         appLogger.log(result);
                //         resolve();
                //     })
                //     .catch((err) => {
                //         appLogger.log('Failed to pull devices from ' + network.name);
                //         reject(err);
                //     })
                resolve()
              })
              .catch((err) => {
                appLogger.log('Failed to pull applications from ' + network.name)
                reject(err)
              })
          })
          .catch((err) => {
            appLogger.log('Failed to pull device profiles from ' + network.name)
            reject(err)
          })
      })
      .catch((err) => {
        appLogger.log('Failed to pull organizations from ' + network.name)
        reject(err)
      })
  })
}

module.exports.pullCompanies = function (sessionData, network, dataAPI, modelAPI) {
  let me = this
  let counter = 0
  let currentConnections = 0
  return new Promise(async function (resolve, reject) {
    // Get the remote companies.
    // Set up the request options.
    let companyMap = []
    let options = {}
    options.method = 'GET'
    options.url = network.baseUrl + '/organizations' + '?limit=9999&offset=0'
    options.headers = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + sessionData.connection
    }
    options.agentOptions = {
      'secureProtocol': 'TLSv1_2_method',
      'rejectUnauthorized': false
    }

    appLogger.log(options)
    request(options, function (error, response, body) {
      if (error) {
        dataAPI.addLog(network, 'Error pulling companies from network ' + network.name + ': ' + error)
        reject(error)
      }
      else {
        body = JSON.parse(body)
        dataAPI.addLog(network, body)
        if (body.totalCount === 0) {
          appLogger.log('No organizations')
          appLogger.log(body)
          resolve(companyMap)
        }
        else {
          let organizations = body.result
          appLogger.log(body)
          counter = organizations.length
          for (let index in organizations) {
            let org = organizations[index]
            if (org.name === 'loraserver') {
              counter = counter - 1
            }
            else {
              if (currentConnections > 30) {
                appLogger.log('Waiting for open connection ' + org.name)
                setTimeout(() => {
                  appLogger.log('Waiting Finished.  Adding ' + org.name)
                  add()
                }, 5000)
              }
              else {
                add()
              }

              function add () {
                currentConnections += 1
                appLogger.log('Added ' + org.name)
                me.addRemoteCompany(sessionData, org, network, dataAPI, modelAPI)
                  .then((companyId) => {
                    counter = counter - 1
                    currentConnections -= 1
                    companyMap.push({organizationId: org.id, companyId: companyId})
                    if (counter <= 0) {
                      resolve(companyMap)
                    }
                  })
                  .catch((error) => {
                    counter = counter - 1
                    currentConnections -= 1
                    appLogger.log(error)
                    if (counter <= 0) {
                      resolve(companyMap)
                    }
                  })
              }
            }
          }
        }
      }
    })
  })
}

module.exports.pullApplications = function (sessionData, network, companyMap, dpMap, dataAPI, modelAPI) {
  let me = this
  let counter = 0
  return new Promise(async function (resolve, reject) {
    let applicationMap = []
    let options = {}
    options.method = 'GET'
    options.url = network.baseUrl + '/applications' + '?limit=9999&offset=0'
    options.headers = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + sessionData.connection
    }
    options.agentOptions = {
      'secureProtocol': 'TLSv1_2_method',
      'rejectUnauthorized': false
    }

    appLogger.log(options)
    request(options, function (error, response, body) {
      if (error) {
        dataAPI.addLog(network, 'Error pulling applications from network ' + network.name + ': ' + error)
        reject(error)
      }
      else {
        body = JSON.parse(body)
        dataAPI.addLog(network, body)
        if (body.totalCount === 0) {
          appLogger.log('No apps')
          appLogger.log(body)
          resolve(applicationMap)
        }
        else {
          let apps = body.result
          appLogger.log(body)
          counter = apps.length
          for (let index in apps) {
            let app = apps[index]
            appLogger.log('Added ' + app.name)
            me.addRemoteApplication(sessionData, app, network, companyMap, dpMap, dataAPI, modelAPI)
              .then((applicationId) => {
                counter = counter - 1
                applicationMap.push({remoteApplicationId: app.id, applicationId: applicationId})
                if (counter <= 0) {
                  resolve(applicationMap)
                }
              })
              .catch((error) => {
                reject(error)
              })
          }
        }
      }
    })
  })
}

module.exports.pullDeviceProfiles = function (sessionData, network, companyMap, dataAPI, modelAPI) {
  let me = this
  let counter = 0
  return new Promise(async function (resolve, reject) {
    let dpMap = []
    let options = {}
    options.method = 'GET'
    options.url = network.baseUrl + '/device-profiles' + '?limit=9999&offset=0'
    options.headers = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + sessionData.connection
    }
    options.agentOptions = {
      'secureProtocol': 'TLSv1_2_method',
      'rejectUnauthorized': false
    }

    appLogger.log(options)
    request(options, function (error, response, body) {
      if (error) {
        dataAPI.addLog(network, 'Error pulling device profiles from network ' + network.name + ': ' + error)
        reject(error)
      }
      else {
        body = JSON.parse(body)
        dataAPI.addLog(network, body)
        if (body.totalCount == 0) {
          appLogger.log('No device profiles')
          appLogger.log(body)
          resolve(dpMap)
        }
        else {
          let deviceProfiles = body.result
          appLogger.log(body)
          counter = deviceProfiles.length
          for (let index in deviceProfiles) {
            let dp = deviceProfiles[index]
            appLogger.log('Added ' + dp.name)
            me.addRemoteDeviceProfile(sessionData, dp, network, companyMap, dataAPI, modelAPI)
              .then((dpId) => {
                counter = counter - 1
                dpMap.push({remoteDeviceProfileId: dp.deviceProfileID, deviceProfileId: dpId})
                if (counter <= 0) {
                  resolve(dpMap)
                }
              })
              .catch((error) => {
                // This one didn't work?  Not sure why
                appLogger.log(error)
                counter = counter - 1
              })
          }
        }
      }
    })
  })
}

module.exports.pullDevices = function (sessionData, network, companyId, dpMap, remoteApplicationId, applicationId, dataAPI, modelAPI) {
  let me = this
  let counter = 0
  return new Promise(async function (resolve, reject) {
    let deviceMap = []
    let options = {}
    options.method = 'GET'
    options.url = network.baseUrl + '/applications/' + remoteApplicationId + '/devices' + '?limit=9999&offset=0'
    options.headers = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + sessionData.connection
    }
    options.agentOptions = {
      'secureProtocol': 'TLSv1_2_method',
      'rejectUnauthorized': false
    }

    appLogger.log(options)
    request(options, function (error, response, body) {
      if (error) {
        dataAPI.addLog(network, 'Error pulling devices from network ' + network.name + ': ' + error)
        reject(error)
      }
      else {
        appLogger.log(body)
        body = JSON.parse(body)
        dataAPI.addLog(network, body)
        if (body.totalCount == 0) {
          appLogger.log('No devices')
          appLogger.log(body)
          resolve(deviceMap)
        }
        else {
          let devices = body.result
          appLogger.log(body)
          counter = devices.length
          for (let index in devices) {
            let device = devices[index]
            appLogger.log('Added ' + device.name)
            me.addRemoteDevice(sessionData, device, network, companyId, dpMap, remoteApplicationId, applicationId, dataAPI, modelAPI)
              .then((deviceId) => {
                counter = counter - 1
                deviceMap.push({remoteDeviceId: device.id, deviceId: deviceId})
                if (counter <= 0) {
                  resolve(deviceMap)
                }
              })
              .catch((error) => {
                reject(error)
              })
          }
        }
      }
    })
  })
}

// Add company.
//
// sessionData     - The session information for the user, including the //                   connection data for the remote system.
// network         - The networks record for the network that uses this
//                   protocol.
// companyId       - The companyNetworkTypeLinks record id for this company and
//                   network.
// dataAPI         - Gives access to the data records and error tracking for the
//                   operation.
//
// Returns a Promise that connects to the remote system and creates the
// company.  The promise saves the id for the remote company, linked to the
// local database record.  This method is called in an async manner against
// lots of other networks, so logging should be done via the dataAPI.
module.exports.addRemoteCompany = function (sessionData, remoteOrganization, network, dataAPI, modelAPI) {
  return new Promise(async function (resolve, reject) {
    let isNewNTL = false
    // 3.  Setup protocol data
    // 4.  Add the company user to the remote Network
    appLogger.log('Adding ' + remoteOrganization.name + ' ' + remoteOrganization)
    // 1.  add the remote company locally through the ICompany Interface
    let existingCompany = await modelAPI.companies.retrieveCompanies({search: remoteOrganization.name})
    if (existingCompany.totalCount > 0) {
      existingCompany = existingCompany.records[0]
      appLogger.log(existingCompany.name + ' already exists')
    }
    else {
      existingCompany = await modelAPI.companies.createCompany(remoteOrganization.name, modelAPI.companies.COMPANY_VENDOR)
      appLogger.log('Created ' + existingCompany.name + ' id ' + existingCompany.id)
    }

    // 2.  add the NTL to the local company
    let existingCompanyNTL = await modelAPI.companyNetworkTypeLinks.retrieveCompanyNetworkTypeLinks({companyId: existingCompany.id})
    appLogger.log(existingCompanyNTL)
    if (existingCompanyNTL.totalCount > 0) {
      existingCompanyNTL = existingCompanyNTL.records[0]
      appLogger.log(existingCompany.name + ' link already exists')
    }
    else {
      appLogger.log('creating Network Link for ' + existingCompany.name)
      existingCompanyNTL = await modelAPI.companyNetworkTypeLinks.createRemoteCompanyNetworkTypeLink(existingCompany.id, network.networkTypeId, {region: ''})
      isNewNTL = true
    }

    if (isNewNTL) {
      // 3.  Setup protocol data
      await
      dataAPI.putProtocolDataForKey(network.id,
        network.networkProtocolId,
        makeCompanyDataKey(existingCompany.id, 'coNwkId'),
        remoteOrganization.id)
      var networkCoId = remoteOrganization.id

      // We will need an admin user for this company.
      var userOptions = {}
      userOptions.method = 'POST'
      userOptions.url = network.baseUrl + '/users'
      userOptions.headers = {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + sessionData.connection
      }

      // Get/generate the company username/password
      var creds = await
      getCompanyAccount(dataAPI, network, existingCompany.id, true)

      userOptions.json = {
        'username': creds.username,
        'password': creds.password,
        'isActive': true,
        'isAdmin': false,
        'sessionTTL': 0,
        'organizations': [
          {
            'isAdmin': true,
            'organizationID': networkCoId
          }
        ],
        'email': 'fake@emailaddress.com',
        'note': 'Created by and for LPWAN Server'
      }
      userOptions.agentOptions = {
        'secureProtocol': 'TLSv1_2_method',
        'rejectUnauthorized': false
      }

      appLogger.log(userOptions)
      request(userOptions, async function (error, response, body) {
        if (error || (response.statusCode >= 400 && response.statusCode != 409)) {
          if (error) {
            dataAPI.addLog(network, 'Error creating ' + existingCompany.name +
              "'s admin user " + userOptions.json.username +
              ': ' + error)
            appLogger.log(error)
            reject(error)
          }
          else {
            dataAPI.addLog(network, 'Error creating ' + existingCompany.name +
              "'s admin user " + userOptions.json.username +
              ': ' + response.statusCode +
              ' (Server message: ' + response.body.error + ')')
            appLogger.log('Error creating ' + existingCompany.name +
              "'s admin user " + userOptions.json.username +
              ': ' + response.statusCode +
              ' (Server message: ' + response.body.error + ')')
            reject(response.statusCode)
            return
            remoteDeviceId
          }
        }
        else {
          // Save the user ID from the remote network.
          await dataAPI.putProtocolDataForKey(network.id,
            network.networkProtocolId,
            makeCompanyDataKey(existingCompany.id, 'coUsrId'),
            body.id)
          // Set up a default Service Profile.
          appLogger.log('Getting SP and NS')
          var serviceProfile = await getServiceProfileForOrg(network, remoteOrganization.id, existingCompany.id, sessionData.connection, dataAPI)
          let networkServer = {}
          if (serviceProfile && serviceProfile.networkServerID) {
            networkServer = await getNetworkServerById(network, serviceProfile.networkServerID, sessionData.connection, dataAPI)
          }
          appLogger.log('Got SP and NS')
          appLogger.log(serviceProfile)
          appLogger.log(networkServer)
          existingCompanyNTL.networkSettings = {serviceProfile: networkServer}
          delete existingCompanyNTL.remoteAccessLogs
          existingCompanyNTL = await modelAPI.companyNetworkTypeLinks.updateRemoteCompanyNetworkTypeLink(existingCompanyNTL)
          resolve(existingCompany.id)
        }
      }) // End of user create request.
    }
    else {
      appLogger.log('Getting SP and NS')
      let serviceProfile = await getServiceProfileForOrg(network, remoteOrganization.id, existingCompany.id, sessionData.connection, dataAPI)
      let networkServer = {}
      if (serviceProfile && serviceProfile.networkServerID) {
        networkServer = await getNetworkServerById(network, serviceProfile.networkServerID, sessionData.connection, dataAPI)
      }
      appLogger.log('Got SP and NS')
      appLogger.log(serviceProfile)
      appLogger.log(networkServer)
      existingCompanyNTL.networkSettings = {serviceProfile: networkServer}
      delete existingCompanyNTL.remoteAccessLogs
      appLogger.log(existingCompanyNTL)
      existingCompanyNTL = await modelAPI.companyNetworkTypeLinks.updateRemoteCompanyNetworkTypeLink(existingCompanyNTL)
      resolve(existingCompany.id)
    }
  })
}

module.exports.addRemoteApplication = function (sessionData, limitedRemoteApplication, network, companyMap, dpMap, dataAPI, modelAPI) {
  let me = this
  return new Promise(async function (resolve, reject) {
    let remoteApplication = await getApplicationById(network, limitedRemoteApplication.id, sessionData.connection, dataAPI)
    appLogger.log('Adding ' + remoteApplication.name)
    appLogger.log(remoteApplication)
    let existingApplication = await modelAPI.applications.retrieveApplications({search: remoteApplication.name})
    appLogger.log(existingApplication)
    if (existingApplication.totalCount > 0) {
      existingApplication = existingApplication.records[0]
      appLogger.log(existingApplication.name + ' already exists')
    }
    else {
      appLogger.log('creating ' + remoteApplication.name)
      let company = companyMap.find(o => o.organizationId === remoteApplication.organizationID)
      appLogger.log(company)
      appLogger.log(companyMap)
      existingApplication = await modelAPI.applications.createApplication(remoteApplication.name, remoteApplication.description, company.companyId, 1, 'http://set.me.to.your.real.url:8888')
      appLogger.log('Created ' + existingApplication.name)
    }

    let existingApplicationNTL = await modelAPI.applicationNetworkTypeLinks.retrieveApplicationNetworkTypeLinks({applicationId: existingApplication.id})
    if (existingApplicationNTL.totalCount > 0) {
      appLogger.log(existingApplication.name + ' link already exists')
    }
    else {
      appLogger.log('creating Network Link for ' + existingApplication.name)
      // let serviceProfile = await getServiceProfileById(network, remoteApplication.serviceProfileID, sessionData.connection, dataAPI);
      // let networkServer = await getNetworkServerById(network, serviceProfile.networkServerID, sessionData.connection, dataAPI);
      // appLogger.log('Got SP and NS');
      // appLogger.log(serviceProfile);
      // appLogger.log(networkServer);
      // delete existingApplicationNTL.remoteAccessLogs;
      let networkSettings = {
        payloadCodec: remoteApplication.payloadCodec,
        payloadDecoderScript: remoteApplication.payloadDecoderScript,
        payloadEncoderScript: remoteApplication.payloadEncoderScript
      }
      existingApplicationNTL = await modelAPI.applicationNetworkTypeLinks.createRemoteApplicationNetworkTypeLink(existingApplication.id, network.networkTypeId, networkSettings, existingApplication.companyId)
      appLogger.log(existingApplicationNTL)
      await dataAPI.putProtocolDataForKey(network.id,
        network.networkProtocolId,
        makeApplicationDataKey(existingApplication.id, 'appNwkId'),
        remoteApplication.id)
    }
    me.pullDevices(sessionData, network, existingApplication.companyId, dpMap, remoteApplication.id, existingApplication.id, dataAPI, modelAPI)
      .then((result) => {
        appLogger.log('Success in pulling devices from ' + network.name)
        appLogger.log(result)
        resolve(existingApplication.id)
      })
      .catch((err) => {
        appLogger.log('Failed to pull devices from ' + network.name)
        reject(err)
      })
  })
}

module.exports.addRemoteDeviceProfile = function (sessionData, limitedRemoteDeviceProfile, network, companyMap, dataAPI, modelAPI) {
  return new Promise(async function (resolve, reject) {
    getDeviceProfileById(network, limitedRemoteDeviceProfile.deviceProfileID, sessionData.connection, dataAPI)
      .then((remoteDeviceProfile) => {
        appLogger.log('Adding ' + remoteDeviceProfile.name)
        appLogger.log(remoteDeviceProfile)
        let company = companyMap.find(o => o.organizationId === remoteDeviceProfile.organizationID)
        appLogger.log(company)
        modelAPI.deviceProfiles.retrieveDeviceProfiles({search: remoteDeviceProfile.name})
          .then(existingDeviceProfile => {
            appLogger.log(existingDeviceProfile)
            if (existingDeviceProfile.totalCount > 0) {
              existingDeviceProfile = existingDeviceProfile.records[0]
              appLogger.log(existingDeviceProfile.name + ' already exists')
              resolve(existingDeviceProfile.id)
            }
            else {
              appLogger.log('creating ' + remoteDeviceProfile.name)
              appLogger.log(remoteDeviceProfile)
              modelAPI.deviceProfiles.createRemoteDeviceProfile(network.networkTypeId, company.companyId,
                remoteDeviceProfile.name, 'Device Profile managed by LPWAN Server, perform changes via LPWAN',
                remoteDeviceProfile.deviceProfile)
                .then((existingDeviceProfile) => {
                  appLogger.log('Created ' + existingDeviceProfile.name)
                  resolve(existingDeviceProfile.id)
                })
                .catch((error) => {
                  appLogger.log(error)
                  reject(error)
                })
            }
          })
          .catch((error) => {
            appLogger.log(error)
            reject(error)
          })
      })
      .catch((error) => {
        appLogger.log(error)
        reject(error)
      })
  })
}

module.exports.addRemoteDevice = function (sessionData, limitedRemoteDevice, network, companyId, dpMap, remoteApplicationId, applicationId, dataAPI, modelAPI) {
  return new Promise(async function (resolve, reject) {
    let remoteDevice = await getDeviceById(network, limitedRemoteDevice.devEUI, sessionData.connection, dataAPI)
    appLogger.log('Adding ' + remoteDevice.name)
    appLogger.log(remoteDevice)
    let deviceProfile = dpMap.find(o => o.remoteDeviceProfileId == remoteDevice.deviceProfileID)
    appLogger.log(deviceProfile)
    let existingDevice = await modelAPI.devices.retrieveDevices({search: remoteDevice.name})
    appLogger.log(existingDevice)
    if (existingDevice.totalCount > 0) {
      existingDevice = existingDevice.records[0]
      appLogger.log(existingDevice.name + ' already exists')
    }
    else {
      appLogger.log('creating ' + remoteDevice.name)
      existingDevice = await modelAPI.devices.createDevice(remoteDevice.name, remoteDevice.description, applicationId)
      appLogger.log('Created ' + existingDevice.name)
    }

    let existingDeviceNTL = await modelAPI.deviceNetworkTypeLinks.retrieveDeviceNetworkTypeLinks({deviceId: existingDevice.id})
    if (existingDeviceNTL.totalCount > 0) {
      appLogger.log(existingDevice.name + ' link already exists')
    }
    else {
      appLogger.log('creating Network Link for ' + existingDevice.name)
      existingDeviceNTL = await modelAPI.deviceNetworkTypeLinks.createRemoteDeviceNetworkTypeLink(existingDevice.id, network.networkTypeId, deviceProfile.deviceProfileId, remoteDevice, companyId)
      appLogger.log(existingDeviceNTL)
      dataAPI.putProtocolDataForKey(network.id,
        network.networkProtocolId,
        makeDeviceDataKey(existingDevice.id, 'devNwkId'),
        remoteDevice.devEUI)
    }
    resolve(existingDevice.id)
  })
}

//* *****************************************************************************
// CRUD applications.
//* *****************************************************************************

// Add application.
//
// sessionData     - The session information for the user, including the //                   connection data for the remote system.
// network         - The networks record for the network that uses this
//                   protocol.
// applicationId   - The application id for the application to create on the
//                   remote network.
// dataAPI         - Gives access to the data records and error tracking for the
//                   operation.
//
// Returns a Promise that connects to the remote system and creates the
// application.  The promise saves the id for the remote application, linked to
// the local database record.  This method is called in an async manner against
// lots of other networks, so logging should be done via the dataAPI.
module.exports.addApplication = function (sessionData, network, applicationId, dataAPI) {
  return new Promise(async function (resolve, reject) {
    var application
    var applicationData
    var coNetworkId
    var coSPId
    try {
      // Get the local application data.
      application = await dataAPI.getApplicationById(applicationId)
      applicationData = await dataAPI.getApplicationNetworkType(applicationId, network.networkTypeId)

      coNetworkId = await dataAPI.getProtocolDataForKey(
        network.id,
        network.networkProtocolId,
        makeCompanyDataKey(application.companyId, 'coNwkId'))
      coSPId = await dataAPI.getProtocolDataForKey(
        network.id,
        network.networkProtocolId,
        makeCompanyDataKey(application.companyId, 'coSPId'))
    }
    catch (err) {
      dataAPI.addLog(network, 'Failed to get required data for addApplication: ' + err)
      reject(err)
      return
    }
    // Set up the request options.
    var options = {}
    options.method = 'POST'
    options.url = network.baseUrl + '/applications'
    options.headers = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + sessionData.connection
    }
    options.json = {
      'name': application.name,
      'organizationID': coNetworkId,
      'serviceProfileID': coSPId
    }
    options.agentOptions = {
      'secureProtocol': 'TLSv1_2_method',
      'rejectUnauthorized': false
    }

    // Optional data
    if (applicationData && applicationData.networkSettings) {
      if (applicationData.networkSettings.payloadCodec) {
        options.json.payloadCodec = applicationData.networkSettings.payloadCodec
      }
      if (applicationData.networkSettings.payloadDecoderScript) {
        options.json.payloadDecoderScript = applicationData.networkSettings.payloadDecoderScript
      }
      if (applicationData.networkSettings.payloadEncoderScript) {
        options.json.payloadEncoderScript = applicationData.networkSettings.payloadEncoderScript
      }
    }

    request(options, async function (error, response, body) {
      if (error || response.statusCode >= 400) {
        if (error) {
          dataAPI.addLog(network, 'Error on create application: ' + error)
          reject(error)
        }
        else {
          dataAPI.addLog(network, 'Error on create application: ' + JSON.stringify(body) + '(' + response.statusCode + ')')
          reject(response.statusCode)
        }
      }
      else {
        try {
          // Save the application ID from the remote network.
          await dataAPI.putProtocolDataForKey(network.id,
            network.networkProtocolId,
            makeApplicationDataKey(application.id, 'appNwkId'),
            body.id)
        }
        catch (err) {
          reject(err)
        }
        resolve(body.id)
      }
    })
  })
}

// Get application.
//
// sessionData     - The session information for the user, including the //                   connection data for the remote system.
// network         - The networks record for the network that uses this
//                   protocol.
// applicationId   - The application id for the application to create on the
//                   remote network.
// dataAPI         - Gives access to the data records and error tracking for the
//                   operation.
//
// Returns a Promise that connects to the remote system and gets the
// application.  This method is called in an async manner against lots of other
// networks, so logging should be done via the dataAPI.
module.exports.getApplication = function (sessionData, network, applicationId, dataAPI) {
  return new Promise(async function (resolve, reject) {
    var appNetworkId = await dataAPI.getProtocolDataForKey(
      network.id,
      network.networkProtocolId,
      makeApplicationDataKey(applicationId, 'appNwkId'))
    // Set up the request options.
    var options = {}
    options.method = 'GET'
    options.url = network.baseUrl + '/applications/' + appNetworkId
    options.headers = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + sessionData.connection
    }
    options.agentOptions = {
      'secureProtocol': 'TLSv1_2_method',
      'rejectUnauthorized': false
    }

    request(options, function (error, response, body) {
      if (error) {
        dataAPI.addLog(network, 'Error on get application: ' + error)
        reject(error)
      }
      else {
        resolve(body)
      }
    })
  })
}

// Update application.
//
// sessionData     - The session information for the user, including the //                   connection data for the remote system.
// network         - The networks record for the network that uses this
//                   protocol.
// applicationId   - The application id for the application to create on the
//                   remote network.
// dataAPI         - Gives access to the data records and error tracking for the
//                   operation.
//
// Returns a Promise that connects to the remote system and updates the
// application.  This method is called in an async manner against
// lots of other networks, so logging should be done via the dataAPI.
module.exports.updateApplication = function (sessionData, network, applicationId, dataAPI) {
  return new Promise(async function (resolve, reject) {
    // Get the application data.
    var application = await dataAPI.getApplicationById(applicationId)
    var coNetworkId = await dataAPI.getProtocolDataForKey(
      network.id,
      network.networkProtocolId,
      makeCompanyDataKey(application.companyId, 'coNwkId'))
    var appNetworkId = await dataAPI.getProtocolDataForKey(
      network.id,
      network.networkProtocolId,
      makeApplicationDataKey(applicationId, 'appNwkId'))
    var applicationData = await dataAPI.getApplicationNetworkType(applicationId, network.networkTypeId)

    // Set up the request options.
    var options = {}
    options.method = 'PUT'
    options.url = network.baseUrl + '/applications/' + appNetworkId
    options.headers = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + sessionData.connection
    }
    options.json = {
      'id': appNetworkId,
      'name': application.name,
      'organizationID': coNetworkId,
      'description': 'This Application is Managed by LPWanServer',
      'payloadCodec': '',
      'payloadDecoderScript': '',
      'payloadEncoderScript': ''
    }
    options.agentOptions = {
      'secureProtocol': 'TLSv1_2_method',
      'rejectUnauthorized': false
    }

    // Optional data
    if (applicationData && applicationData.networkSettings) {
      if (applicationData.networkSettings.isABP) {
        options.json.isABP = applicationData.networkSettings.isABP
      }
      if (applicationData.networkSettings.isClassC) {
        options.json.isClassC = applicationData.networkSettings.isClassC
      }
      if (applicationData.networkSettings.relaxFCnt) {
        options.json.relaxFCnt = applicationData.networkSettings.relaxFCnt
      }
      if (applicationData.networkSettings.rXDelay) {
        options.json.rXDelay = applicationData.networkSettings.rXDelay
      }
      if (applicationData.networkSettings.rX1DROffset) {
        options.json.rX1DROffset = applicationData.networkSettings.rX1DROffset
      }
      if (applicationData.networkSettings.rXWindow) {
        options.json.rXWindow = applicationData.networkSettings.rXWindow
      }
      if (applicationData.networkSettings.rX2DR) {
        options.json.rX2DR = applicationData.networkSettings.rX2DR
      }
      if (applicationData.networkSettings.aDRInterval) {
        options.json.aDRInterval = applicationData.networkSettings.aDRInterval
      }
      if (applicationData.networkSettings.installationMargin) {
        options.json.installationMargin = applicationData.networkSettings.installationMargin
      }
      if (applicationData.networkSettings.payloadCodec && applicationData.networkSettings.payloadCodec !== 'NONE') {
        options.json.payloadCodec = applicationData.networkSettings.payloadCodec
      }
      if (applicationData.networkSettings.payloadDecoderScript) {
        options.json.payloadDecoderScript = applicationData.networkSettings.payloadDecoderScript
      }
      if (applicationData.networkSettings.payloadEncoderScript) {
        options.json.payloadEncoderScript = applicationData.networkSettings.payloadEncoderScript
      }
    }
    appLogger.log(application)
    appLogger.log(applicationData)
    appLogger.log(options)

    request(options, function (error, response, body) {
      if (error) {
        dataAPI.addLog(network, 'Error on update application: ' + error)
        reject(error)
      }
      else {
        appLogger.log(body)
        resolve()
      }
    })
  })
}

// Delete the application.
//
// sessionData     - The session information for the user, including the //                   connection data for the remote system.
// network         - The networks record for the network that uses this
//                   protocol.
// applicationId   - The application id for the application to create on the
//                   remote network.
// dataAPI         - Gives access to the data records and error tracking for the
//                   operation.
//
// Returns a Promise that connects to the remote system and deletes the
// application.  This method is called in an async manner against
// lots of other networks, so logging should be done via the dataAPI.
module.exports.deleteApplication = function (sessionData, network, applicationId, dataAPI) {
  return new Promise(async function (resolve, reject) {
    // Get the application data.
    var application = await dataAPI.getApplicationById(applicationId)
    var appNetworkId = await dataAPI.getProtocolDataForKey(
      network.id,
      network.networkProtocolId,
      makeApplicationDataKey(applicationId, 'appNwkId'))
    // Set up the request options.
    var options = {}
    options.method = 'DELETE'
    options.url = network.baseUrl + '/applications/' + appNetworkId
    options.headers = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + sessionData.connection
    }
    options.agentOptions = {
      'secureProtocol': 'TLSv1_2_method',
      'rejectUnauthorized': false
    }

    request(options, async function (error, response, body) {
      if (error) {
        dataAPI.addLog(network, 'Error on delete application: ' + error)
        reject(error)
      }
      else {
        // get rid of the local copy of the applicationID
        await dataAPI.deleteProtocolDataForKey(
          network.id,
          network.networkProtocolId,
          makeApplicationDataKey(applicationId, 'appNwkId'))
        resolve()
      }
    })
  })
}

// Push the application, meaning update if it exists, and create if it doesn't.
//
// sessionData   - The session information for the user, including the
//                 connection data for the remote system.
// network       - The networks record for the network that uses this protocol.
// applicationId - The company to be deleted on the remote system.
// dataAPI       - Gives access to the data records and error tracking for the
//                 operation.
//
// Returns a Promise that pushes the application record to the remote system.
module.exports.pushApplication = function (sessionData, network, applicationId, dataAPI) {
  return new Promise(async function (resolve, reject) {
    // Try a "get" to see if the application is already there.
    var app
    try {
      app = await module.exports.getApplication(sessionData, network, applicationId, dataAPI)
    }
    catch (err) {
      if (err == 404) {
        // Need to create, then.
        var appid
        try {
          appid = await module.exports.addApplication(sessionData, network, applicationId, dataAPI)
          resolve(appid)
        }
        catch (err) {
          reject(err)
        }
        return
      }
      else {
        reject(err)
        return
      }
    }

    // Get worked - do an update.
    try {
      await module.exports.updateApplication(sessionData, network, applicationId, dataAPI)
    }
    catch (err) {
      reject(err)
    }
    resolve()
  })
}

//* *****************************************************************************
// Start/Stop Application data delivery.
//* *****************************************************************************
// Used to identify running applications/networks.  Map :A
var activeApplicationNetworkProtocols = {}

// Start the application.
//
// sessionData   - The session data to access the account on the network.
// network       - The networks record for the network that uses this
// applicationId - The application's record id.
// dataAPI       - Gives access to the data records and error tracking for the
//                 operation.
//
// Returns a Promise that starts the application data flowing from the remote
// system.
module.exports.startApplication = function (sessionData, network, applicationId, dataAPI) {
  var me = this
  return new Promise(async function (resolve, reject) {
    try {
      // Create a new endpoint to get POSTs, and call the deliveryFunc.
      // Use the local applicationId and the networkId to create a unique
      // URL.
      var deliveryURL = 'api/ingest/' + applicationId + '/' + network.id
      var reportingAPI = await dataAPI.getReportingAPIByApplicationId(applicationId)

      // Link the reporting API to the application and network.
      activeApplicationNetworkProtocols['' + applicationId + ':' + network.id] = reportingAPI

      // Set up the Forwarding with LoRa App Server
      var appNwkId = await dataAPI.getProtocolDataForKey(
        network.id,
        network.networkProtocolId,
        makeApplicationDataKey(applicationId, 'appNwkId'))
      var options = {}
      options.method = 'POST'
      options.url = network.baseUrl + '/applications/' + appNwkId + '/integrations/http'
      options.headers = {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + sessionData.connection
      }
      options.agentOptions = {
        'secureProtocol': 'TLSv1_2_method',
        'rejectUnauthorized': false
      }
      options.json = {}
      options.json.dataUpURL = nconf.get('base_url') + deliveryURL

      request(options, function (error, response, body) {
        if (error) {
          dataAPI.addLog(network, 'Error on add application data reporting: ' + error)
          reject(error)
        }
        else {
          resolve()
        }
      })
    }
    catch (err) {
      dataAPI.addLog(network, 'Error on add application data reporting: ' + err)
      reject(err)
    }
    ;
  })
}

// Stop the application.
//
// sessionData   - The session data to access the account on the network.
// network       - The networks record for the network that uses this protocol.
// applicationId - The local application's id to be stopped.
// dataAPI       - Gives access to the data records and error tracking for the
//                 operation.
//
// Returns a Promise that stops the application data flowing from the remote
// system.
module.exports.stopApplication = function (sessionData, network, applicationId, dataAPI) {
  return new Promise(async function (resolve, reject) {
    // Can't delete if not running on the network.
    if (activeApplicationNetworkProtocols['' + applicationId + ':' + network.id] === undefined) {
      // We don't think the app is running on this network.
      dataAPI.addLog(network, 'Application ' + applicationId +
        ' is not running on network ' + network.id)
      reject(404)
      return
    }

    try {
      var appNwkId = await dataAPI.getProtocolDataForKey(
        network.id,
        network.networkProtocolId,
        makeApplicationDataKey(applicationId, 'appNwkId'))
    }
    catch (err) {
      dataAPI.addLog(network, 'Cannot delete application data forwarding for application ' +
        applicationId +
        ' and network ' +
        network.name +
        ': ' + err)
      reject(err)
      return
    }

    // Kill the Forwarding with LoRa App Server
    var options = {}
    options.method = 'DELETE'
    options.url = network.baseUrl + '/applications/' + appNwkId + '/integrations/http'
    options.headers = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + sessionData.connection
    }
    options.agentOptions = {
      'secureProtocol': 'TLSv1_2_method',
      'rejectUnauthorized': false
    }
    request(options, function (error, response, body) {
      if (error) {
        dataAPI.addLog(network, 'Error on delete application notification: ' + error)
        reject(error)
      }
      else {
        // Clear the api entry.
        delete activeApplicationNetworkProtocols['' + applicationId + ':' + network.id]

        // Return success.
        resolve()
      }
    })
  })
}

// Post the data to the remote application server.
//
// networkId     - The network's id that the data is coming from.
// applicationId - The local application's id.
// data          - The data sent.
//
// Redirects the data to the application's server.  Uses the data from the
// remote network to look up the device to include that data as well.
module.exports.passDataToApplication = function (network, applicationId, data, dataAPI) {
  return new Promise(async function (resolve, reject) {
    // Get the reporting API, reject data if not running.
    var reportingAPI = activeApplicationNetworkProtocols['' + applicationId + ':' + network.id]

    if (!reportingAPI) {
      appLogger.log('Rejecting received data from networkId ' + network.id +
        ' for applicationId ' + applicationId +
        '. The appliction is not in a running state.  Data = ' +
        JSON.stringify(data))
      reject('Application not running')
      return
    }

    // This is a stand-alone call, so we'll generate our own data API to access
    // the protocolData.
    // Look up the DevEUI to get the deviceId to pass to the reportingAPI.
    try {
      var deviceId
      if (data.devEUI) {
        var recs = await dataAPI.getProtocolDataWithData(
          network.id,
          'dev:%/devNwkId',
          data.devEUI)
        if (recs && (recs.length > 0)) {
          let splitOnSlash = recs[0].dataIdentifier.split('/')
          let splitOnColon = splitOnSlash[0].split(':')
          deviceId = parseInt(splitOnColon[1])

          let device = await dataAPI.getDeviceById(deviceId)
          data.deviceInfo = {}
          data.deviceInfo.name = device.name
          data.deviceInfo.description = device.description
          data.deviceInfo.model = device.deviceModel
        }
      }

      let app = await dataAPI.getApplicationById(applicationId)

      data.applicationInfo = {}
      data.applicationInfo.name = app.name

      data.networkInfo = {}
      data.networkInfo.name = network.name

      await reportingAPI.report(data, app.baseUrl, app.name)
    }
    catch (err) {
      reject(err)
    }

    resolve()
  })
}

//* *****************************************************************************
// CRUD deviceProfiles.
//* *****************************************************************************

// Add deviceProfile.
//
// sessionData     - The session information for the user, including the //                   connection data for the remote system.
// network         - The networks record for the network that uses this
//                   protocol.
// applicationId   - The application id for the application to create on the
//                   remote network.
// dataAPI         - Gives access to the data records and error tracking for the
//                   operation.
//
// Returns a Promise that connects to the remote system and creates the
// application.  The promise saves the id for the remote application, linked to
// the local database record.  This method is called in an async manner against
// lots of other networks, so logging should be done via the dataAPI.
module.exports.addDeviceProfile = function (sessionData, network, deviceProfileId, dataAPI) {
  return new Promise(async function (resolve, reject) {
    var deviceProfile
    var networkServerId
    try {
      // Get the deviceProfile data.
      deviceProfile = await dataAPI.getDeviceProfileById(deviceProfileId)
      coNetworkId = await dataAPI.getProtocolDataForKey(
        network.id,
        network.networkProtocolId,
        makeCompanyDataKey(deviceProfile.companyId, 'coNwkId'))

      networkServerId = await getANetworkServerIDFromServiceProfile(network, sessionData.connection, deviceProfile.companyId, dataAPI)

      // Set up the request options.
      var options = {}
      options.method = 'POST'
      options.url = network.baseUrl + '/device-profiles'
      options.headers = {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + sessionData.connection
      }
      options.json = {
        'name': deviceProfile.name,
        'networkServerID': networkServerId,
        'organizationID': coNetworkId,
        'deviceProfile': {
          'macVersion': '1.0.2',
          'regParamsRevision': 'B',
          'supportsJoin': false,
          'maxEIRP': 30,
          'supports32bitFCnt': true
        }
      }
      options.agentOptions = {
        'secureProtocol': 'TLSv1_2_method',
        'rejectUnauthorized': false
      }

      // Optional data
      if (deviceProfile.networkSettings) {
        if (deviceProfile.networkSettings.macVersion) {
          options.json.deviceProfile.macVersion = deviceProfile.networkSettings.macVersion
        }
        if (deviceProfile.networkSettings.regParamsRevision) {
          options.json.deviceProfile.regParamsRevision = deviceProfile.networkSettings.regParamsRevision
        }
        if (deviceProfile.networkSettings.supportsJoin) {
          options.json.deviceProfile.supportsJoin = deviceProfile.networkSettings.supportsJoin
        }
        if (deviceProfile.networkSettings.classBTimeout) {
          options.json.deviceProfile.classBTimeout = deviceProfile.networkSettings.classBTimeout
        }
        if (deviceProfile.networkSettings.classCTimeout) {
          options.json.deviceProfile.classCTimeout = deviceProfile.networkSettings.classCTimeout
        }
        if (deviceProfile.networkSettings.factoryPresetFreqs) {
          options.json.deviceProfile.factoryPresetFreqs = deviceProfile.networkSettings.factoryPresetFreqs
        }
        if (deviceProfile.networkSettings.maxDutyCycle) {
          options.json.deviceProfile.maxDutyCycle = deviceProfile.networkSettings.maxDutyCycle
        }
        if (deviceProfile.networkSettings.maxEIRP) {
          options.json.deviceProfile.maxEIRP = deviceProfile.networkSettings.maxEIRP
        }
        if (deviceProfile.networkSettings.pingSlotDR) {
          options.json.deviceProfile.pingSlotDR = deviceProfile.networkSettings.pingSlotDR
        }
        if (deviceProfile.networkSettings.pingSlotFreq) {
          options.json.deviceProfile.pingSlotFreq = deviceProfile.networkSettings.pingSlotFreq
        }
        if (deviceProfile.networkSettings.pingSlotPeriod) {
          options.json.deviceProfile.pingSlotPeriod = deviceProfile.networkSettings.pingSlotPeriod
        }
        if (deviceProfile.networkSettings.regParamsRevision) {
          options.json.deviceProfile.regParamsRevision = deviceProfile.networkSettings.regParamsRevision
        }
        if (deviceProfile.networkSettings.rfRegion) {
          options.json.deviceProfile.rfRegion = deviceProfile.networkSettings.rfRegion
        }
        if (deviceProfile.networkSettings.rxDROffset1) {
          options.json.deviceProfile.rxDROffset1 = deviceProfile.networkSettings.rxDROffset1
        }
        if (deviceProfile.networkSettings.rxDataRate2) {
          options.json.deviceProfile.rxDataRate2 = deviceProfile.networkSettings.rxDataRate2
        }
        if (deviceProfile.networkSettings.rxDelay1) {
          options.json.deviceProfile.rxDelay1 = deviceProfile.networkSettings.rxDelay1
        }
        if (deviceProfile.networkSettings.rxFreq2) {
          options.json.deviceProfile.rxFreq2 = deviceProfile.networkSettings.rxFreq2
        }
        if (deviceProfile.networkSettings.supports32bitFCnt) {
          options.json.deviceProfile.supports32bitFCnt = deviceProfile.networkSettings.supports32bitFCnt
        }
        if (deviceProfile.networkSettings.supportsClassB) {
          options.json.deviceProfile.supportsClassB = deviceProfile.networkSettings.supportsClassB
        }
        if (deviceProfile.networkSettings.supportsClassC) {
          options.json.deviceProfile.supportsClassC = deviceProfile.networkSettings.supportsClassC
        }
        if (deviceProfile.networkSettings.supportsJoin) {
          options.json.deviceProfile.supportsJoin = deviceProfile.networkSettings.supportsJoin
        }
      }
      request(options, async function (error, response, body) {
        if (error || response.statusCode >= 400) {
          if (error) {
            dataAPI.addLog(network, 'Error on create deviceProfile: ' + error)
            reject(error)
          }
          else {
            dataAPI.addLog(network, 'Error on create deviceProfile: ' + body + '(' + response.statusCode + ')')
            reject(response.statusCode)
          }
        }
        else {
          // Save the deviceProfile ID from the remote network.
          await dataAPI.putProtocolDataForKey(network.id,
            network.networkProtocolId,
            makeDeviceProfileDataKey(deviceProfile.id, 'dpNwkId'),
            body.deviceProfileID)

          resolve(body.id)
        }
      })
    }
    catch (err) {
      reject(err)
    }
  })
}

// Get deviceProfile.
//
// sessionData     - The session information for the user, including the //                   connection data for the remote system.
// network         - The networks record for the network that uses this
//                   protocol.
// deviceProfileId - The deviceProfile id for the deviceProfile to get from the
//                   remote network.
// dataAPI         - Gives access to the data records and error tracking for the
//                   operation.
//
// Returns a Promise that connects to the remote system and gets the
// deviceProfile.  This method is called in an async manner against lots of other
// networks, so logging should be done via the dataAPI.
module.exports.getDeviceProfile = function (sessionData, network, deviceProfileId, dataAPI) {
  return new Promise(async function (resolve, reject) {
    var dpNetworkId
    try {
      dpNetworkId = await dataAPI.getProtocolDataForKey(
        network.id,
        network.networkProtocolId,
        makeDeviceProfileDataKey(deviceProfileId, 'dpNwkId'))
    }
    catch (err) {
      dataAPI.addLog(network, 'Error on get deviceProfile network ID: ' + err)
      reject(err)
    }
    // Set up the request options.
    var options = {}
    options.method = 'GET'
    options.url = network.baseUrl + '/device-profiles/' + dpNetworkId
    options.headers = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + sessionData.connection
    }
    options.agentOptions = {
      'secureProtocol': 'TLSv1_2_method',
      'rejectUnauthorized': false
    }
    request(options, function (error, response, body) {
      if (error || response.statusCode >= 400) {
        if (error) {
          dataAPI.addLog(network, 'Error on get deviceProfile: ' + error)
          reject(error)
        }
        else {
          dataAPI.addLog(network, 'Error on get deviceProfile: ' + body + '(' + response.statusCode + ')')
          reject(response.statusCode)
        }
      }
      else {
        resolve(body)
      }
    })
  })
}

// Update deviceProfile.
//
// sessionData     - The session information for the user, including the //                   connection data for the remote system.
// network         - The networks record for the network that uses this
//                   protocol.
// deviceProfileId - The deviceProfile id for the deviceProfile to update on the
//                   remote network.
// dataAPI         - Gives access to the data records and error tracking for the
//                   operation.
//
// Returns a Promise that connects to the remote system and updates the
// deviceProfile.  This method is called in an async manner against
// lots of other networks, so logging should be done via the dataAPI.
module.exports.updateDeviceProfile = function (sessionData, network, deviceProfileId, dataAPI) {
  return new Promise(async function (resolve, reject) {
    // Get the application data.
    var deviceProfile
    var dpNetworkId
    var coNetworkId
    try {
      deviceProfile = await dataAPI.getDeviceProfileById(deviceProfileId)
      dpNetworkId = await dataAPI.getProtocolDataForKey(
        network.id,
        network.networkProtocolId,
        makeDeviceProfileDataKey(deviceProfileId, 'dpNwkId'))
      coNetworkId = await dataAPI.getProtocolDataForKey(
        network.id,
        network.networkProtocolId,
        makeCompanyDataKey(deviceProfile.companyId, 'coNwkId'))
    }
    catch (err) {
      dataAPI.addLog(network, 'Error getting supporting data for update device Profile: ' + err)
      reject(err)
      return
    }
    // Set up the request options.
    var options = {}
    options.method = 'PUT'
    options.url = network.baseUrl + '/device-profiles/' + dpNetworkId
    options.headers = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + sessionData.connection
    }
    options.json = {
      'name': deviceProfile.name,
      'organizationID': coNetworkId
    }
    options.agentOptions = {
      'secureProtocol': 'TLSv1_2_method',
      'rejectUnauthorized': false
    }

    // Optional data
    if (deviceProfile.networkSettings) {
      if (deviceProfile.networkSettings.macVersion) {
        options.json.macVersion = deviceProfile.networkSettings.macVersion
      }
      if (deviceProfile.networkSettings.regParamsRevision) {
        options.json.regParamsRevision = deviceProfile.networkSettings.regParamsRevision
      }
      if (deviceProfile.networkSettings.supportsJoin) {
        options.json.supportsJoin = deviceProfile.networkSettings.supportsJoin
      }
      if (deviceProfile.networkSettings.classBTimeout) {
        options.json.classBTimeout = deviceProfile.networkSettings.classBTimeout
      }
      if (deviceProfile.networkSettings.classCTimeout) {
        options.json.classCTimeout = deviceProfile.networkSettings.classCTimeout
      }
      if (deviceProfile.networkSettings.factoryPresetFreqs) {
        options.json.factoryPresetFreqs = deviceProfile.networkSettings.factoryPresetFreqs
      }
      if (deviceProfile.networkSettings.maxDutyCycle) {
        options.json.maxDutyCycle = deviceProfile.networkSettings.maxDutyCycle
      }
      if (deviceProfile.networkSettings.maxEIRP) {
        options.json.maxEIRP = deviceProfile.networkSettings.maxEIRP
      }
      if (deviceProfile.networkSettings.pingSlotDR) {
        options.json.pingSlotDR = deviceProfile.networkSettings.pingSlotDR
      }
      if (deviceProfile.networkSettings.pingSlotFreq) {
        options.json.pingSlotFreq = deviceProfile.networkSettings.pingSlotFreq
      }
      if (deviceProfile.networkSettings.pingSlotPeriod) {
        options.json.pingSlotPeriod = deviceProfile.networkSettings.pingSlotPeriod
      }
      if (deviceProfile.networkSettings.regParamsRevision) {
        options.json.regParamsRevision = deviceProfile.networkSettings.regParamsRevision
      }
      if (deviceProfile.networkSettings.rfRegion) {
        options.json.rfRegion = deviceProfile.networkSettings.rfRegion
      }
      if (deviceProfile.networkSettings.rxDROffset1) {
        options.json.rxDROffset1 = deviceProfile.networkSettings.rxDROffset1
      }
      if (deviceProfile.networkSettings.rxDataRate2) {
        options.json.rxDataRate2 = deviceProfile.networkSettings.rxDataRate2
      }
      if (deviceProfile.networkSettings.rxDelay1) {
        options.json.rxDelay1 = deviceProfile.networkSettings.rxDelay1
      }
      if (deviceProfile.networkSettings.rxFreq2) {
        options.json.rxFreq2 = deviceProfile.networkSettings.rxFreq2
      }
      if (deviceProfile.networkSettings.supports32bitFCnt) {
        options.json.supports32bitFCnt = deviceProfile.networkSettings.supports32bitFCnt
      }
      if (deviceProfile.networkSettings.supportsClassB) {
        options.json.supportsClassB = deviceProfile.networkSettings.supportsClassB
      }
      if (deviceProfile.networkSettings.supportsClassC) {
        options.json.supportsClassC = deviceProfile.networkSettings.supportsClassC
      }
      if (deviceProfile.networkSettings.supportsJoin) {
        options.json.supportsJoin = deviceProfile.networkSettings.supportsJoin
      }
    }

    request(options, function (error, response, body) {
      if (error || response.statusCode >= 400) {
        if (error) {
          dataAPI.addLog(network, 'Error on put deviceProfile: ' + error)
          reject(error)
        }
        else {
          dataAPI.addLog(network, 'Error on put deviceProfile: ' + body + '(' + response.statusCode + ')')
          reject(response.statusCode)
        }
      }
      else {
        resolve()
      }
    })
  })
}

// Delete the deviceProfile.
//
// sessionData     - The session information for the user, including the //                   connection data for the remote system.
// network         - The networks record for the network that uses this
//                   protocol.
// deviceProfileId - The application id for the deviceProfile to delete on the
//                   remote network.
// dataAPI         - Gives access to the data records and error tracking for the
//                   operation.
//
// Returns a Promise that connects to the remote system and deletes the
// deviceProfile.  This method is called in an async manner against
// lots of other networks, so logging should be done via the dataAPI.
module.exports.deleteDeviceProfile = function (sessionData, network, deviceProfileId, dataAPI) {
  return new Promise(async function (resolve, reject) {
    try {
      // Get the deviceProfile data.
      var deviceProfile = await dataAPI.getDeviceProfileById(deviceProfileId)
      var dpNetworkId = await dataAPI.getProtocolDataForKey(
        network.id,
        network.networkProtocolId,
        makeDeviceProfileDataKey(deviceProfileId, 'dpNwkId'))
      await dataAPI.deleteProtocolDataForKey(
        network.id,
        network.networkProtocolId,
        makeDeviceProfileDataKey(deviceProfileId, 'dpNwkId'))
    }
    catch (err) {
      dataAPI.addLog(network, 'Error getting supporting data for delete deviceProfile: ' + err)
      reject(err)
      return
    }

    // Set up the request options.
    var options = {}
    options.method = 'DELETE'
    options.url = network.baseUrl + '/device-profiles/' + dpNetworkId
    options.headers = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + sessionData.connection
    }
    options.agentOptions = {
      'secureProtocol': 'TLSv1_2_method',
      'rejectUnauthorized': false
    }

    request(options, function (error, response, body) {
      if (error || response.statusCode >= 400) {
        if (error) {
          dataAPI.addLog(network, 'Error on delete deviceProfile: ' + error)
          reject(error)
        }
        else {
          dataAPI.addLog(network, 'Error on delete deviceProfile: ' + body + '(' + response.statusCode + ')')
          reject(response.statusCode)
        }
      }
      else {
        resolve()
      }
    })
  })
}

// Push the deviceProfile, meaning update if it exists, and create if it
// doesn't.
//
// sessionData     - The session information for the user, including the
//                   connection data for the remote system.
// network         - The networks record for the network that uses this
//                   protocol.
// deviceProfileId - The company to be deleted on the remote system.
// dataAPI         - Gives access to the data records and error tracking for the
//                   operation.
//
// Returns a Promise that pushes the application record to the remote system.
module.exports.pushDeviceProfile = function (sessionData, network, deviceProfileId, dataAPI) {
  return new Promise(async function (resolve, reject) {
    // Try a "get" to see if the application is already there.
    var dp
    try {
      dp = await module.exports.getDeviceProfile(sessionData, network, deviceProfileId, dataAPI)
    }
    catch (err) {
      if (err == 404) {
        // Need to create, then.
        var dpid
        try {
          dpid = await module.exports.addDeviceProfile(sessionData, network, deviceProfileId, dataAPI)
          resolve(dpid)
        }
        catch (err) {
          reject(err)
        }
        return
      }
      reject(err)
      return
    }

    // Get worked - do an update.
    try {
      await module.exports.updateDeviceProfile(sessionData, network, deviceProfileId, dataAPI)
    }
    catch (err) {
      reject(err)
    }
    resolve()
  })
}

//* *****************************************************************************
// CRUD devices.
//* *****************************************************************************

// Add device.
//
// sessionData     - The session information for the user, including the //                   connection data for the remote system.
// network         - The networks record for the network that uses this
//                   protocol.
// companyData     - The companyNetworkTypeLinks record for this company and
//                   network.
// applicationData - The applicationNetworkTypeLinks record for this device's
//                   Application and network.
// device          - The device record.
// deviceData      - The deviceNetworkTypeLinks record for this device
//                   and network.
//
// Returns a Promise that connects to the remote system and creates the
// device.  The promise returns the id of the created device to be added to the
// deviceNetworkTypeLinks record by the caller.
module.exports.addDevice = function (sessionData, network, deviceId, dataAPI) {
  return new Promise(async function (resolve, reject) {
    var device
    var dntl
    var devpro
    var appNwkId
    var dpNwkId
    try {
      device = await dataAPI.getDeviceById(deviceId)
      dntl = await dataAPI.getDeviceNetworkType(deviceId, network.networkTypeId)
      devpro = await dataAPI.getDeviceProfileById(dntl.deviceProfileId)
      if (!dntl.networkSettings || !dntl.networkSettings.devEUI) {
        dataAPI.addLog(network, 'deviceNetworkTypeLink MUST have networkSettings which MUST have devEUI')
        reject(400)
        return
      }
      appNwkId = await dataAPI.getProtocolDataForKey(
        network.id,
        network.networkProtocolId,
        makeApplicationDataKey(device.applicationId, 'appNwkId'))
      dpNwkId = await dataAPI.getProtocolDataForKey(
        network.id,
        network.networkProtocolId,
        makeDeviceProfileDataKey(dntl.deviceProfileId, 'dpNwkId'))
    }
    catch (err) {
      dataAPI.addLog(network, 'Error getting data for remote network: ' + err)
      reject(err)
      return
    }
    // Set up the request options.
    var options = {}
    options.method = 'POST'
    options.url = network.baseUrl + '/devices'
    options.headers = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + sessionData.connection
    }
    options.json = {
      'applicationID': appNwkId,
      'description': device.name,
      'devEUI': dntl.networkSettings.devEUI,
      'deviceProfileID': dpNwkId,
      'name': device.name
    }

    options.agentOptions = {
      'secureProtocol': 'TLSv1_2_method',
      'rejectUnauthorized': false
    }

    // Optional data
    var devNS = dntl.networkSettings

    request(options, function (error, response, body) {
      if (error || response.statusCode >= 400) {
        if (error) {
          dataAPI.addLog(network, 'Error on create device: ' + error)
          reject(error)
        }
        else {
          dataAPI.addLog(network, 'Error on create device (' + response.statusCode + '): ' + body.error)
          reject(response.statusCode)
        }
      }
      else {
        // LoRa Open Source uses the DevEUI as the node id.
        dataAPI.putProtocolDataForKey(network.id,
          network.networkProtocolId,
          makeDeviceDataKey(device.id, 'devNwkId'),
          options.json.devEUI)

        // Devices have to do a second call to set up either the
        // Application Key (OTAA) or the Keys for ABP.
        if (!devpro.networkSettings.supportsJoin) {
          // This is the ABP path.
          options.url = network.baseUrl + '/devices/' +
            dntl.networkSettings.devEUI + '/activate'
          options.json = {
            'devEUI': dntl.networkSettings.devEUI,
            'devAddr': dntl.networkSettings.devAddr,
            'nwkSKey': dntl.networkSettings.nwkSKey,
            'appSKey': dntl.networkSettings.appSKey,
            'fCntUp': dntl.networkSettings.fCntUp,
            'fCntDown': dntl.networkSettings.fCntDown,
            'skipFCntCheck':
            dntl.networkSettings.skipFCntCheck
          }
          appLogger.log('options.json = ' + JSON.stringify(options.json))
        }
        else {
          // This is the OTAA path.
          options.url = network.baseUrl + '/devices/' +
            dntl.networkSettings.devEUI + '/keys'
          options.json = {
            'devEUI': dntl.networkSettings.devEUI,
            'deviceKeys': {
              'appKey': devNS.appKey
            }
          }
        }
        request(options, function (error, response, body) {
          if (error || response.statusCode >= 400) {
            if (error) {
              dataAPI.addLog(network, 'Error on create device keys: ' + error)
            }
            else {
              dataAPI.addLog(network, 'Error on create device keys (' + response.statusCode + '): ' + body.error)
            }
            resolve(dntl.networkSettings.devEUI)
          }
          else {
            resolve(dntl.networkSettings.devEUI)
          }
        })
      }
    })
  })
}

// Get device.
//
// sessionData     - The session information for the user, including the //                   connection data for the remote system.
// network         - The networks record for the network that uses this
//                   protocol.
// companyData     - The companyNetworkTypeLinks record for this company and
//                   network.
// applicationData - The applicationNetworkTypeLinks record for this device's
//                   Application and network.
// device          - The device record.
// deviceData      - The deviceNetworkTypeLinks record for this device
//                   and network.
//
// Returns a Promise that gets the device data from the remote system.
module.exports.getDevice = function (sessionData, network, deviceId, dataAPI) {
  return new Promise(async function (resolve, reject) {
    try {
      var devNetworkId = await dataAPI.getProtocolDataForKey(
        network.id,
        network.networkProtocolId,
        makeDeviceDataKey(deviceId, 'devNwkId'))
    }
    catch (err) {
      reject(err)
      return
    }
    // Set up the request options.
    var options = {}
    options.method = 'GET'
    options.url = network.baseUrl + '/devices/' + devNetworkId
    options.headers = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + sessionData.connection
    }
    options.agentOptions = {
      'secureProtocol': 'TLSv1_2_method',
      'rejectUnauthorized': false
    }

    request(options, function (error, response, body) {
      if (error || response.statusCode >= 400) {
        if (error) {
          dataAPI.addLog(network, 'Error on get device: ' + error)
          reject(error)
        }
        else {
          dataAPI.addLog(network, 'Error on get device (' + response.statusCode + '): ' + body.error)
          reject(response.statusCode)
        }
      }
      else {
        resolve(body)
      }
    })
  })
}

// Update device.
//
// sessionData - The session information for the user, including the connection //               data for the remote system.
// network     - The networks record for the network that uses this protocol.
// deviceId    - The device id for the device to create on the remote network.
// dataAPI     - Gives access to the data records and error tracking for the
//               operation.
//
// Returns a Promise that connects to the remote system and updates the
// device.  This method is called in an async manner against lots of other
// networks, so logging should be done via the dataAPI.
module.exports.updateDevice = function (sessionData, network, deviceId, dataAPI) {
  return new Promise(async function (resolve, reject) {
    var device
    var application
    var devNetworkId
    var appNetworkId
    var dpNwkId
    var dntl
    try {
      // Get the device data.
      device = await dataAPI.getDeviceById(deviceId)
      let dp = await dataAPI.getDeviceProfileByDeviceIdNetworkTypeId(deviceId, network.networkTypeId)
      dntl = await dataAPI.getDeviceNetworkType(deviceId, network.networkTypeId)
      devNetworkId = await dataAPI.getProtocolDataForKey(
        network.id,
        network.networkProtocolId,
        makeDeviceDataKey(deviceId, 'devNwkId'))
      appNwkId = await dataAPI.getProtocolDataForKey(
        network.id,
        network.networkProtocolId,
        makeApplicationDataKey(device.applicationId, 'appNwkId'))
      dpNwkId = await dataAPI.getProtocolDataForKey(
        network.id,
        network.networkProtocolId,
        makeDeviceProfileDataKey(dp.id, 'dpNwkId'))
    }
    catch (err) {
      dataAPI.addLog(network, 'Failed to get supporting data for updateDevice: ' + err)
      reject(err)
      return
    }

    // Set up the request options.
    var options = {}
    options.method = 'PUT'
    options.url = network.baseUrl + '/devices/' + devNetworkId
    options.headers = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + sessionData.connection
    }
    options.json = {
      'applicationID': appNwkId,
      'description': device.name,
      'devEUI': dntl.networkSettings.devEUI,
      'deviceProfileID': dpNwkId,
      'name': device.name
    }
    options.agentOptions = {
      'secureProtocol': 'TLSv1_2_method',
      'rejectUnauthorized': false
    }
    request(options, function (error, response, body) {
      if (error || response.statusCode >= 400) {
        if (error) {
          appLogger.log('Error on update device: ' + error)
          dataAPI.addLog(network, 'Error on update device: ' + error)
          reject(error)
        }
        else {
          appLogger.log('Error on update device (' + response.statusCode + '): ' + body.error)
          dataAPI.addLog(network, 'Error on update device (' + response.statusCode + '): ' + body.error)
          reject(response.statusCode)
        }
      }
      else {
        // Devices have a separate API for appkeys...
        options.url = network.baseUrl + '/devices/' + dntl.networkSettings.devEUI + '/keys'
        options.json = {
          'devEUI': dntl.networkSettings.devEUI,
          'deviceKeys': {
            'appKey': dntl.networkSettings.appKey
          }
        }
        request(options, function (error, response, body) {
          if (error || response.statusCode >= 400) {
            if (error) {
              dataAPI.addLog(network, 'Error on update device keys: ' + error)
            }
            else {
              dataAPI.addLog(network, 'Error on update device keys (' + response.statusCode + '): ' + body.error)
            }
            resolve()
          }
          else {
            resolve()
          }
        })
      }
    })
  })
}

// Delete the device.
//
// sessionData     - The session information for the user, including the //                   connection data for the remote system.
// network         - The networks record for the network that uses this
//                   protocol.
// companyData     - The companyNetworkTypeLinks record for this company and
//                   network.
// applicationData - The applicationNetworkTypeLinks record for this device's
//                   Application and network.
// device          - The device record.
// deviceData      - The deviceNetworkTypeLinks record for this device
//                   and network.
//
// Returns a Promise that gets the application record from the remote system.
module.exports.deleteDevice = function (sessionData, network, deviceId, dataAPI) {
  return new Promise(async function (resolve, reject) {
    var devNetworkId
    try {
      devNetworkId = await dataAPI.getProtocolDataForKey(
        network.id,
        network.networkProtocolId,
        makeDeviceDataKey(deviceId, 'devNwkId'))
    }
    catch (err) {
      // Can't delete without the remote ID.
      dataAPI.addLog(network, "Failed to get remote network's device ID: " + err)
      reject(err)
      return
    }

    // Set up the request options.
    var options = {}
    options.method = 'DELETE'
    options.url = network.baseUrl + '/devices/' + devNetworkId
    options.headers = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + sessionData.connection
    }
    options.agentOptions = {
      'secureProtocol': 'TLSv1_2_method',
      'rejectUnauthorized': false
    }

    request(options, async function (error, response, body) {
      if (error || response.statusCode >= 400) {
        if (error) {
          dataAPI.addLog(network, 'Error on delete device: ' + error)
          reject(error)
        }
        else {
          dataAPI.addLog(network, 'Error on delete device (' + response.statusCode + '): ' + body.error)
          reject(response.statusCode)
        }
      }
      else {
        // Deleted device, network key is no longer valid.
        try {
          await dataAPI.deleteProtocolDataForKey(
            network.id,
            network.networkProtocolId,
            makeDeviceDataKey(deviceId, 'devNwkId'))
        }
        catch (err) {
          dataAPI.addLog(network, "Failed to delete remote network's device ID: " + err)
        }

        // Devices have a separate API for appkeys...
        options.url = network.baseUrl + '/devices/' + devNetworkId + '/keys'
        request(options, function (error, response, body) {
          if (error || response.statusCode >= 400) {
            if (error) {
              dataAPI.addLog(network, 'Error on delete device keys: ' + error)
            }
            else {
              dataAPI.addLog(network, 'Error on delete device keys (' + response.statusCode + '): ' + body.error)
            }
            resolve()
          }
          else {
            resolve()
          }
        })
        resolve()
      }
    })
  })
}

// Push the device, meaning update if it exists, and create if it doesn't.
//
// sessionData     - The session information for the user, including the
//                   connection data for the remote system.
// network         - The networks record for the network that uses this
//                   protocol.
// deviceId        - The device to be deleted on the remote system.
// dataAPI         - Gives access to the data records and error tracking for the
//                   operation.
//
// Returns a Promise that pushes the device record to the remote system.
module.exports.pushDevice = function (sessionData, network, deviceId, dataAPI) {
  return new Promise(async function (resolve, reject) {
    // Try a "get" to see if the device is already there.
    var d
    try {
      d = await module.exports.getDevice(sessionData, network, deviceId, dataAPI)
    }
    catch (err) {
      if (err == 404) {
        // Need to create, then.
        var did
        try {
          did = await module.exports.addDevice(sessionData, network, deviceId, dataAPI)
          resolve(did)
        }
        catch (err) {
          reject(err)
        }
        return
      }
      reject(err)
      return
    }

    // Get worked - do an update.
    try {
      await module.exports.updateDevice(sessionData, network, deviceId, dataAPI)
    }
    catch (err) {
      reject(err)
    }
    resolve()
  })
}