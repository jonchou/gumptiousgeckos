require('dotenv').config();
const db = require('./../../db/db.js');
const path = require('path');
const rp = require('request-promise');
const GITHUB_CALLBACK = process.env.GITHUB_CALLBACK;

var QueryFile = db.$config.pgp.QueryFile;

function sql(file) {
  const fullPath = path.join(__dirname, './../../db/queries/projects', file);
  return new QueryFile(fullPath, { minify: true });
}

const queries = {
  getAllProjects: sql('getAllProjects.sql'),
  getUserProjects: sql('getUserProjects.sql'),
  addProject: sql('addProject.sql'),
  getProjectById: sql('getProjectById.sql'),
  addTopProjects: sql('getTopProjects.sql'),
  addTopProjectsAndUserVotes: sql('getTopProjectsAndUserVotes.sql')
};


module.exports.getAllProjects = (req, res) => {

  return db.query(queries.getAllProjects)
  .then((data) => {
    console.log('Success getting all projects');
    res.status(200).json(data);
  })
  .catch((error) => {
    res.status(404).send('failed to get all projects');
  });
};

module.exports.postProject = (req, res) => {
  const { id } = req.user[0];
  const { projectId, name, description, link, api } = req.body;
  rp({
    method: 'POST',
    uri: api + '/hooks',
    body: {
      name: 'web',
      active: true,
      events: ['pull_request'],
      config: {
        url: GITHUB_CALLBACK + '/github/hook',
        content_type: 'json'
      }
    },
    headers: {
      'User-Agent': 'git-agora',
      Authorization: `token ${req.cookies.git_token}`
    },
    json: true
  })
  .then(() => console.log('webhook successful for ', api))
  .catch(() => console.log('error for ', api));
  rp({
    method: 'GET',
    uri: api + '/pulls',
    qs: {
      state: 'all',
      per_page: 100
    },
    headers: {
      'User-Agent': 'git-agora'
    }
  })
  .then((pulls) => {
    JSON.parse(pulls).forEach((pull) => {
      rp({
        method: 'POST',
        uri: GITHUB_CALLBACK + '/github/new',
        body: Object.assign({}, pull),
        json: true
      });
    });
  })
  .catch(error => console.log(error));
  return db.one(queries.addProject, {
    projectId,
    user_id: id,
    title: name,
    description,
    link
  })
  .then((results) => {
    res.status(201).send(results);
  })
  .catch((error) => {
    res.status(404).send('failed adding project');
  });
};

module.exports.getUserProjects = (req, res) => {
  db.query(queries.getUserProjects, { id: req.params.id })
  .then((results) => {
    res.status(200).json(results);
  })
  .catch((error) => {
    res.status(404).send('ERROR', error);
  });
};

module.exports.getProjectById = (req, res) => {
  db.query(queries.getProjectById, { id: req.params.id })
  .then((results) => {
    res.status(200).json(results);
  })
  .catch((error) => {
    res.status(404).send('ERROR', error);
  });
};

module.exports.getTopProjects = (req, res) => {
  if (req.user) {
    return db.query(queries.addTopProjectsAndUserVotes, {user_id: req.user[0].id})
    .then((data) => {
      console.log('Success getting top projects', data);
      res.status(200).json(data);
    })
    .catch(error => {
      res.status(404).send('failed to get projects and user votes');
    });
  } else {
    return db.query(queries.addTopProjects)
    .then((data) => {
      console.log('Success getting projects');
      res.status(200).json(data);
    })
    .catch(error => {
      res.status(404).send('failed to get projects without userId');
    });
  }
};
