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
    admin.initializeApp();
  }
}

const db = admin.firestore();

exports.handler = async (event, context) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { targetUid, newRole, requesterUid } = JSON.parse(event.body);

    if (!targetUid || !newRole || !requesterUid) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing required fields" }) };
    }

    // Check if requester is already an owner
    const requesterDoc = await db.collection("users").doc(requesterUid).get();
    const isOwner = requesterDoc.exists && requesterDoc.data().role === "owner";

    // CHECK FOR BOOTSTRAPPING: If there are NO owners in the database, allow anyone to become owner
    const ownersSnapshot = await db.collection("users").where("role", "==", "owner").limit(1).get();
    const noOwnersExist = ownersSnapshot.empty;

    if (isOwner || (noOwnersExist && newRole === "owner" && targetUid === requesterUid)) {
      await db.collection("users").doc(targetUid).set({
        role: newRole,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: requesterUid
      }, { merge: true });

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: true, message: `Role updated to ${newRole}` })
      };
    } else {
      return { 
        statusCode: 403, 
        body: JSON.stringify({ error: "Unauthorized. Only Owners can manage roles." }) 
      };
    }
  } catch (error) {
    console.error("Error setting user role:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal Server Error" })
    };
  }
};
