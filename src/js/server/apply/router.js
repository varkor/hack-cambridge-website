const express = require('express');
const { createApplicationForm } = require('js/shared/application-form');
const { createTeamForm } = require('js/shared/team-form');
const renderForm = require('js/shared/render-form');
var fetch = require('node-fetch');
const auth = require('js/server/auth');
const utils = require('../utils.js');
const session = require('client-sessions');
const statuses = require('js/shared/status-constants');
const { Hacker, HackerApplication, Team, TeamMember } = require('js/server/models');
const applyLogic = require('./logic');
const fileUploadMiddleware = require('./file-upload');

const applyRouter = new express.Router();

applyRouter.get('/', (req, res) => {
  if (req.user) {
    res.redirect(`${req.baseUrl}/dashboard`);
    return;
  }

  res.render('apply/index.html');
});

applyRouter.use(auth.requireAuth);

// Route to redirect to whatever next step is required
applyRouter.get('/', (req, res) => {
  res.redirect(`${req.baseUrl}/form`);
});

applyRouter.all('/form', checkHasApplied);

applyRouter.post('/form', fileUploadMiddleware.single('cv'), (req, res, next) => {
  const form = createApplicationForm();

  // HACK: Put all our fields in the same place by moving the file into req.body
  req.body.cv = req.file;

  form.handle(req.body, {
    success: (resultForm) => {
      applyLogic.createApplicationFromForm(resultForm.data, req.user)
        .then(() => {
          res.redirect(`${req.baseUrl}/form`);
        })
        .catch(next);
    },
    error: (resultForm) => {
      renderApplyPageWithForm(res, resultForm);
    },
    empty: () => {
      renderApplyPageWithForm(res, form);
    }
  });
});

applyRouter.post('/team', fileUploadMiddleware.none(), (req, res, next) => {
  const form = createTeamForm();

  form.handle(req.body, {
    success: (resultForm) => {
      const errors = { };
      applyLogic.createTeamFromForm(resultForm.data, req.user, errors).then(() => {
        console.log('Team application success.');
        res.redirect('/apply/dashboard');
      }).catch(err => {
        console.log('Invalid team application:', err.message);
        req.user.getHackerApplication().then(hackerApplication => {
          res.locals.applicationSlug = hackerApplication.applicationSlug;
          renderTeamPageWithForm(res, createTeamForm(resultForm.data), errors);
        });
      });
    },
    error: (resultForm) => {
      renderTeamPageWithForm(res, resultForm);
    },
    empty: () => {
      renderTeamPageWithForm(res, form);
    }
  });
});

applyRouter.get('/dashboard', auth.requireAuth, function(req, res) {
  renderDashboard(req, res);
})

applyRouter.get('/logout', auth.logout, function(req, res) {
  res.redirect('/');
})

// The login page (has the login button)
applyRouter.get('/', function (req, res) {
  res.render('apply/index.html');
});

// Render the form for additional applicant details
applyRouter.get('/form', (req, res) => {
  renderApplyPageWithForm(res, createApplicationForm());
});

// Render the form for team applications
applyRouter.get('/team', (req, res) => {
  req.user.getHackerApplication().then(hackerApplication => {
    if (hackerApplication !== null) {
      req.user.getTeam().then(team => {
        if (team === null) {
          res.locals.applicationSlug = hackerApplication.applicationSlug;
          renderTeamPageWithForm(res, createTeamForm());
        } else {
          // User already in a team
          res.redirect('/apply/dashboard');
        }
      });
    } else {
      res.redirect('/apply/form');
    }
  });
});

function renderDashboard(req, res) {
  const content = utils.loadResource('dashboard');
  let application;
  let applicationStatus;

  req.user.getHackerApplication().then(hackerApplication => {
    application       = hackerApplication;
    applicationStatus = req.user.getApplicationStatus(hackerApplication);

    const teamApplicationStatusPromise    = req.user.getTeamApplicationStatus(hackerApplication);
    const furtherApplicationStatusPromise = req.user.getFurtherDetailsStatus(hackerApplication);
    const responseStatusPromise           = req.user.getResponseStatus(hackerApplication);

    const teamMembersPromise = req.user.getTeam().then(teamMember => {
      if (teamMember === null) {
        return null;
      } else {
        const teamId = teamMember.teamId;
        return TeamMember.findAll({
          where: {
            teamId: teamId,
          }
        })
      }
    }).then(teamMembers => {
      if (teamMembers == null) {
        return null;
      }
      return Promise.all(
        teamMembers.map(member => member.getHacker())
      )
    });

    return Promise.all([
      teamApplicationStatusPromise,
      furtherApplicationStatusPromise,
      responseStatusPromise,
      teamMembersPromise
    ]);
  }).then(values => {
    const teamApplicationStatus    = values[0];
    const furtherApplicationStatus = values[1];
    const responseStatus           = values[2];
    const teamMembers              = values[3];

    const overallStatus = Hacker.deriveOverallStatus(
      applicationStatus,
      responseStatus,
      teamApplicationStatus,
      furtherApplicationStatus
    );

    res.render('apply/dashboard.html', {
      applicationSlug: (application === null) ? null : application.applicationSlug,
      applicationStatus: applicationStatus,
      teamApplicationStatus: teamApplicationStatus,
      furtherApplicationStatus: furtherApplicationStatus,

      applicationInfo: content['your-application'][applicationStatus],
      teamApplicationInfo: content['team-application'][teamApplicationStatus],
      furtherApplicationInfo: content['further-application'][furtherApplicationStatus],
      statusMessage: content['status-messages'][overallStatus],
      teamMembers: teamMembers,
    });
  });
}

function renderPageWithForm(res, path, form, errors = { }) {
  res.render(path, {
    formHtml: form.toHTML((name, field, options = { }) => {
      if (errors.hasOwnProperty(name)) {
        field.errorHTML = () => `<p class="error_msg form-error-message">${errors[name]}</p>`;
      }
      return renderForm(name, field, options);
    })
  });
}

function renderApplyPageWithForm(res, form, errors = { }) {
  renderPageWithForm(res, 'apply/form.html', form, errors);
}

function renderTeamPageWithForm(res, form, errors = { }) {
  renderPageWithForm(res, 'apply/team.html', form, errors);
}

/**
 * Intercepts the request to check if the user has submitted an application
 * 
 * If they have, it will redirect them to the dashboard. Otherwise, it will let them proceed
 * as normal.
 */
function checkHasApplied(req, res, next) {
  req.user.getHackerApplication().then(hackerApplication => {
    if (hackerApplication) {
      res.redirect(`${req.baseUrl}/dashboard`);
      return;
    } 

    next();
  }).catch(next);
}

module.exports = applyRouter;
