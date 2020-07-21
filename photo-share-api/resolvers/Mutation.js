const { authorizeWithGithub } = require('../lib');
const fetch = require('node-fetch');

module.exports = {
  async addFakeUsers(root, { count }, { db }) {
    const randomUserApi = `https://randomuser.me/api/?results=${count}`;
    const { results } = await fetch(randomUserApi).then(res => res.json());

    const users = results.map(result => ({
      githubLogin: result.login.username,
      name: `${result.name.first} ${result.name.last}`,
      avatar: result.picture.thumbnail,
      githubToken: result.login.sha1,
    }));

    await db.collection('users').insertMany(users);

    return users;
  },

  async fakeUserAuth(parent, { githubLogin }, { db }) {
    const user = await db.collection('users').findOne({ githubLogin });

    if (!user) {
      throw new Error(`Cannot find user with githubLogin "${githubLogin}"`);
    }

    return {
      token: user.githubToken,
      user,
    };
  },

  async postPhoto(parent, args, { db, currentUser }) {
    if (!currentUser) {
      throw new Error('Only an authorized user can post a photo');
    }

    const newPhoto = {
      ...args.input,
      userID: currentUser.githubLogin,
      created: new Date(),
    };

    const { insertedIds } = await db.collection('photos').insertOne(newPhoto);
    newPhoto.id = insertedIds[0];

    return newPhoto;
  },
  async githubAuth(parent, { code }, { db }) {
    let {
      message,
      access_token,
      avatar_url,
      login,
      name,
    } = await authorizeWithGithub({
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET,
      code,
    });

    if (message) {
      throw new Error(message);
    }

    let latestUserInfo = {
      name,
      githubLogin: login,
      githubToken: access_token,
      avatar: avatar_url,
    };

    const {
      ops: [user],
    } = await db
      .collection('users')
      .replaceOne({ githubLogin: login }, latestUserInfo, { upsert: true });
    return { user, token: access_token };
  },
};
