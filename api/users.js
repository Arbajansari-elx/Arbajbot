const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

module.exports = async (req, res) => {
  try {
    const result = await admin.auth().listUsers();
    const users = result.users.map(u => ({
      name: u.displayName || 'No Name',
      email: u.email,
      lastLogin: u.metadata.lastSignInTime,
      created: u.metadata.creationTime,
    }));
    res.json({ total: users.length, users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
