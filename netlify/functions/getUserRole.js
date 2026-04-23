const admin = require("firebase-admin");

if (!admin.apps.length) {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT 
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT) 
    : null;

  if (serviceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  } else {
    // Fallback for local dev if service account isn't set
    admin.initializeApp();
  }
}

const db = admin.firestore();

exports.handler = async (event, context) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const data = JSON.parse(event.body);
    let targetUid = data.uid;

    // Optional: Verify caller identity if no UID provided
    if (!targetUid) {
      const authHeader = event.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return { statusCode: 401, body: JSON.stringify({ error: "Missing token" }) };
      }
      const token = authHeader.split("Bearer ")[1];
      const decodedToken = await admin.auth().verifyIdToken(token);
      targetUid = decodedToken.uid;
    }

    const userDoc = await db.collection("users").doc(targetUid).get();
    const role = userDoc.exists ? (userDoc.data().role || "user") : "user";

    // Check if there is ANY owner in the database (for bootstrapping)
    const ownersSnapshot = await db.collection("users").where("role", "==", "owner").limit(1).get();
    const hasOwner = !ownersSnapshot.empty;

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, hasOwner })
    };
  } catch (error) {
    console.error("Error fetching user role:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal Server Error" })
    };
  }
};
