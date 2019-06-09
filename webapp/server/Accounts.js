

import { get } from 'lodash';
import { Accounts } from 'meteor/accounts-base';
import validator from 'validator';

// import { Meteor } from 'meteor/meteor';


// Accounts.emailTemplates.siteName = 'Symptomatic';
// Accounts.emailTemplates.from = 'Symptomatic <catherder@symptomatic.io>';

// Accounts.emailTemplates.enrollAccount.subject = (user) => {
//     // return `Welcome to Symptomatic, ${user.profile.name}`;
//     return `Welcome to Symptomatic`;
// };

// Accounts.emailTemplates.enrollAccount.text = (user, url) => {
//     return 'Thank you for deciding to sign up. To activate your account, simply click the link below:\n\n' + url;
// };

// Accounts.emailTemplates.enrollAccount = {
//   subject(user) {
//     // return `Welcome to Symptomatic, ${user.profile.name}`;
//     return `Welcome to Symptomatic`;
//   },
//   text(user, url) {
//       return 'Thank you for deciding to sign up. To activate your account, simply click the link below:\n\n' + url;
//       // return `Hey ${user}! Verify your e-mail by following this link: ${url}`;
//   }
// };

// Accounts.urls.enrollAccount = function(token) {
//   return Meteor.absoluteUrl("signin?token=" + token)
// };


Meteor.methods({
  sendVerificationEmail(userId){
    check(userId, String);

    // send an enrollment email
    console.log('Sending verfication email....', Meteor.users.findOne(userId));
    // Accounts.sendEnrollmentEmail(userId);
    Accounts.sendVerificationEmail(userId);
  },
  sendEnrollmentEmail(userId){
    check(userId, String);
    
    // send an enrollment email
    console.log('Sending enrollment email....', Meteor.users.findOne(userId));
    // Accounts.sendEnrollmentEmail(userId);
    Accounts.sendEnrollmentEmail(userId, function(error, result){
      if(error) {
        console.log('sendEnrollmentEmail.error', error)
      }
      if(result) {
        console.log('sendEnrollmentEmail.result', result)
      }
    });
  },
  async checkIfEmailExists(email){
    check(email, String);
    console.log('email', email)
    if(email.length > 0){
      console.log('Lets try to find the user by email...')
      let result = await Accounts.findUserByEmail(email);
      if(result){
        console.log('Found user: ', result);
      } else {
        console.log('No user found with that email.')
      }
      //console.log('result', result)
      return result;
    }
  }
})
Accounts.onCreateUser(function(options, user) {
  console.log('------------------------------------------------');
  console.log('Creating a new User Account....');
  console.log(' ');

  console.log('user._id: ' + user._id);
  process.env.DEBUG && console.log('options', options);
  console.log(' ');

  if(process.env.NODE_ENV === "production"){
    console.log('Confirmed that we are in production.');
    if(typeof Accounts === "object"){
      console.log("Accounts object exists.  Sending enrollment email...")
      Accounts.sendEnrollmentEmail(user._id, function(error, result){
        if(error) {
          console.log('sendEnrollmentEmail.error', error)
        }
        if(result) {
          console.log('sendEnrollmentEmail.result', result)
        }
      });      
      console.log("Success?  We didn't error out while sending the enrollment email, so lets assume it worked.")
    } else {
      console.log("Accounts object doesn't exist.  Skipping.")
    }  
  } else {
    console.log('Not in production.  Skipping.')
  }

    
  // We still want the default hook's 'profile' behavior.
  if (options.profile){
    process.env.DEBUG && console.log("options.profile exists");

    console.log('Configuring profile....');
    user.profile = options.profile;
    user.profile.firstTimeVisit = true;


    console.log('Configuring roles....');
    user.roles = [];

    // some of our test data will be initialized with a profile.role of Physician
    // if so, we want to set their system access to 'practitioner'
    if (options.profile.role === 'Physician') {
      user.roles = ['practitioner'];
      Roles.addUsersToRoles(user._id, ['practitioner']);
    }

    // otherwise, we check whether thay have an access code to grant practitioner access
    if (options.accessCode && get(Meteor, 'settings.private.practitionerAccessCode')) {
      if (options.accessCode === get(Meteor, 'settings.private.practitionerAccessCode')) {
        process.env.DEBUG && console.log('AccessCodes match!  Assigning practitioner role...');

        user.roles = ['practitioner'];
        Roles.addUsersToRoles(user._id, ['practitioner']);
      }
    }

    // also check for admin access
    if (options.accessCode) {
      process.env.DEBUG && console.log("options.profile.accessCode exists");

      if (get(Meteor, 'settings.private.sysadminAccessCode')) {
        process.env.DEBUG && console.log("Meteor.settings.private.sysadminAccessCode exists");

        if (options.accessCode === get(Meteor, 'settings.private.sysadminAccessCode')) {
          process.env.DEBUG && console.log('AccessCodes match!  Assigning sysadmin role...');

          user.roles = ['sysadmin'];
          Roles.addUsersToRoles(user._id, ['sysadmin']);
        }
      }
    }

    // if no other roles have been assigned, make the new user a patient
    if (user.roles.length === 0) {
      user.roles.push('patient');
      Roles.addUsersToRoles(user._id, ['patient']);
    }
  }

  // this lets us add OAuth services in the profile at account creation time
  // when then get securely stored 
  console.log('Configuring authentication services....');
  if(get(options, 'profile.services')){
    let services = get(options, 'profile.services');
    Object.keys(services).forEach(function(key){
      user.services[key] = services[key];      
    })
    delete user.profile.services;
  }

  process.env.DEBUG && console.log('modified user', user);

  return user;
});




Accounts.onLogin(function(loginObject) {
  console.log('Logging in user: ' + get(loginObject, 'user.profile.name.text'));
  process.env.DEBUG && console.log('Accounts.onLogin().loginObject', loginObject)

  let userId = get(loginObject, 'user._id');
  process.env.NODE_ENV === "verbose" ? console.log('userId', userId) : null;

  // =================================================================
  // CONSENTS

  var consents;  
  if(!get(loginObject, 'user.profile.consents')){
    var defaultConsents = {
      performanceAnalytics: {
        "resourceType": "Consent",
        "id": "Consent/" + userId + "/performanceAnalytics",
        "status": "inactive",
        "patient": {
          "reference": "Patient/" + userId
        },
        "dateTime": new Date(),
        "consentingParty": [{
          "reference": "Patient/" + userId
        }],
        "category": [],
        "organization": [{
          "reference": "Organization/Symptomatic",
          "display": "Symptomatic"
        }],
        "policyRule": "http://hl7.org/fhir/ConsentPolicy/opt-in",
        "except": []
    },
      medicalCodeLookup: {
        "resourceType": "Consent",
        "id": "Consent/" + userId + "/medicalCodeLookup",
        "status": "inactive",
        "patient": {
          "reference": "Patient/" + userId
        },
        "dateTime": new Date(),
        "consentingParty": [{
          "reference": "Patient/" + userId
        }],
        "category": [],
        "organization": [{
          "reference": "Organization/Symptomatic",
          "display": "Symptomatic"
        }],
        "policyRule": "http://hl7.org/fhir/ConsentPolicy/opt-in",
        "except": []
      },
      patientEducationReferences: {
        "resourceType": "Consent",
        "id": "Consent/" + userId + "/patientEducationReferences",
        "status": "inactive",
        "patient": {
          "reference": "Patient/" + userId
        },
        "dateTime": new Date(),
        "consentingParty": [{
          "reference": "Patient/" + userId
        }],
        "category": [],
        "organization": [{
          "reference": "Organization/Symptomatic",
          "display": "Symptomatic"
        }],
        "policyRule": "http://hl7.org/fhir/ConsentPolicy/opt-in",
        "except": []
      },
      geocoding: {
        "resourceType": "Consent",
        "id": "Consent/" + userId + "/geocoding",
        "status": "inactive",
        "patient": {
          "reference": "Patient/" + userId
        },
        "dateTime": new Date(),
        "consentingParty": [{
          "reference": "Patient/" + userId
        }],
        "category": [],
        "organization": [{
          "reference": "Organization/Symptomatic",
          "display": "Symptomatic"
        }],
        "policyRule": "http://hl7.org/fhir/ConsentPolicy/opt-in",
        "except": []
      }
    }
    Meteor.users.update({_id: userId}, {$set: {
      'profile.consents': defaultConsents
    }});
    
    console.log('userId', userId);
  };

  // =================================================================
  // FILTERS

  var defaultFilters = {
    // remove: ['gonorrhoeae', 'eGFR', 'chlamydia' ],
    remove: [],
    mustHave: [],
    resourceTypes: [
      'Allergies', 
      'CarePlans',
      'Conditions', 
      'Immunizations', 
      'MedicationOrders', 
      'MedicationStatements', 
      'Observations', 
      'Procedures' 
    ],
    sensitiveItems: {
      subtanceAbuse: true,
      mentalHealth: true,
      sexualHealth: true
    }
  };  
  if(!get(loginObject, 'user.profile.filters')){    
    Meteor.users.update({_id: userId}, {$set: {
      'profile.filters': defaultFilters
    }});
  }
});


Accounts.onLogout(function(user){

  let logoutEvent = { 
    "resourceType" : "AuditEvent",
    "action" : 'Logout',
    "recorded" : new Date(), 
    "outcome" : 'Success',
    "outcomeDesc" : 'User logged out and deauthenticated.',
    "agent" : [{
        "altId" : user._id, // Alternative User id e.g. authentication
        "name" : get(user, 'profile.text'), // Human-meaningful name for the agent
        "requestor" : true  
    }],
    "source" : { 
      "site" : Meteor.absoluteUrl(),
      "identifier": {
        "value": 'Accounts Subsystem'
      }
    },
    "entity": []
  }

  // console.log('logoutEvent', logoutEvent);    

  HipaaLogger.logAuditEvent(logoutEvent, {validate: get(Meteor, 'settings.public.defaults.schemas.validate', false)}, function(error, result){
    if(error) console.error('HipaaLogger.logEvent.error.invalidKeys', error.invalidKeys)
    if(result) console.error(result)
  }); 

}) 