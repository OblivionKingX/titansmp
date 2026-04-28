const functions = require("firebase-functions");
const admin = require("firebase-admin");
const fetch = require("node-fetch");
const util = require('minecraft-server-util');

admin.initializeApp();
const db = admin.firestore();
const auth = admin.auth();

// ============================================================
// 🔐 HARDCODED ROLE CONFIGURATION (only visible server-side)
// Add emails here — nobody on the frontend can see this file.
// ============================================================
const OWNER_EMAILS = [
    "oblivionkingx228@gmail.com",
    "lowiekstaessen@gmail.com",   // 👈 Replace with your email
];

const ADMIN_EMAILS = [
    "lowiekstaessen@gmail.com",    // 👈 Add admin emails here
];

const STAFF_EMAILS = [
    // "lowiekstaessen@gmail.com",    // 👈 Add staff emails here
];

/**
 * Determines the role for a given email based on the hardcoded lists.
 * Returns null if not in any special list.
 */
function getRoleFromEmail(email) {
    if (!email) return null;
    const e = email.toLowerCase();
    if (OWNER_EMAILS.map(x => x.toLowerCase()).includes(e)) return "owner";
    if (ADMIN_EMAILS.map(x => x.toLowerCase()).includes(e)) return "admin";
    if (STAFF_EMAILS.map(x => x.toLowerCase()).includes(e)) return "staff";
    return null;
}

// ============================================================
// getUserRole — called on login to get the user's role
// Also auto-assigns role if user is in the hardcoded lists
// ============================================================
exports.getUserRole = functions.https.onCall(async (data, context) => {
    let targetUid = data?.uid;

    if (!targetUid) {
        if (!context.auth) {
            throw new functions.https.HttpsError("unauthenticated", "Authentication required.");
        }
        targetUid = context.auth.uid;
    }

    try {
        const userDoc = await db.collection("users").doc(targetUid).get();
        let role = userDoc.exists ? (userDoc.data().role || "user") : "user";

        // Auto-assign from hardcoded email list (if user is in the list but not yet in DB)
        if (context.auth && context.auth.token && context.auth.token.email) {
            const hardcodedRole = getRoleFromEmail(context.auth.token.email);
            if (hardcodedRole && role !== hardcodedRole) {
                // Promote them automatically
                await db.collection("users").doc(targetUid).set({
                    role: hardcodedRole,
                    email: context.auth.token.email,
                    autoAssigned: true,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
                role = hardcodedRole;
            }
        }

        // Check if any owner exists (for bootstrapping)
        const ownersSnapshot = await db.collection("users").where("role", "==", "owner").limit(1).get();
        const hasOwner = !ownersSnapshot.empty;

        return { role, hasOwner };
    } catch (error) {
        console.error("Error fetching user role:", error);
        throw new functions.https.HttpsError("internal", "Unable to fetch user role.");
    }
});

// ============================================================
// setUserRole — Owner only, sets a user's role in Firestore
// ============================================================
exports.setUserRole = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "You must be logged in.");
    }

    const { targetUid, newRole } = data;
    if (!targetUid || !newRole) {
        throw new functions.https.HttpsError("invalid-argument", "Target UID and new role are required.");
    }

    const validRoles = ["owner", "admin", "staff", "user"];
    if (!validRoles.includes(newRole)) {
        throw new functions.https.HttpsError("invalid-argument", `Invalid role. Must be one of: ${validRoles.join(", ")}`);
    }

    const requesterUid = context.auth.uid;

    // Check if requester is an owner
    const requesterDoc = await db.collection("users").doc(requesterUid).get();
    const isOwner = requesterDoc.exists && requesterDoc.data().role === "owner";

    // Also allow if requester email is hardcoded as owner
    const requesterEmail = context.auth.token?.email || "";
    const isHardcodedOwner = getRoleFromEmail(requesterEmail) === "owner";

    // Allow bootstrapping: if NO owner exists yet, let anyone claim owner for themselves
    const ownersSnapshot = await db.collection("users").where("role", "==", "owner").limit(1).get();
    const noOwnersExist = ownersSnapshot.empty;
    const isBootstrapping = noOwnersExist && newRole === "owner" && targetUid === requesterUid;

    if (isOwner || isHardcodedOwner || isBootstrapping) {
        // Get email for the target user
        let targetEmail = "";
        try {
            const userRecord = await auth.getUser(targetUid);
            targetEmail = userRecord.email || "";
        } catch (e) { /* ignore */ }

        await db.collection("users").doc(targetUid).set({
            role: newRole,
            email: targetEmail,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedBy: requesterUid
        }, { merge: true });

        return { success: true, message: `Role updated to ${newRole}` };
    } else {
        throw new functions.https.HttpsError("permission-denied", "Only Owners can change roles.");
    }
});

// ============================================================
// listUsers — returns all users with roles, for the admin panel
// Only accessible by owner or admin
// ============================================================
exports.listUsers = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "You must be logged in.");
    }

    const requesterUid = context.auth.uid;
    const requesterDoc = await db.collection("users").doc(requesterUid).get();
    const requesterRole = requesterDoc.exists ? requesterDoc.data().role : "user";

    // Also allow hardcoded admins/owners
    const requesterEmail = context.auth.token?.email || "";
    const hardcodedRole = getRoleFromEmail(requesterEmail);
    const effectiveRole = hardcodedRole || requesterRole;

    if (!["owner", "admin"].includes(effectiveRole)) {
        throw new functions.https.HttpsError("permission-denied", "Only Admins and Owners can list users.");
    }

    try {
        // Get all users with roles from Firestore
        const usersSnapshot = await db.collection("users").orderBy("updatedAt", "desc").limit(100).get();
        const users = [];
        usersSnapshot.forEach(doc => {
            users.push({
                uid: doc.id,
                role: doc.data().role || "user",
                email: doc.data().email || "",
                updatedAt: doc.data().updatedAt?.toDate?.() || null
            });
        });
        return { users };
    } catch (error) {
        console.error("Error listing users:", error);
        throw new functions.https.HttpsError("internal", "Failed to list users.");
    }
});

// ============================================================
// sendWebhook — secure Discord webhook forwarding
// ============================================================

exports.sendWebhook = functions.https.onCall(async (data, context) => {
    const { type, payload } = data;
    if (!type || !payload) {
        throw new functions.https.HttpsError("invalid-argument", "Webhook type and payload are required.");
    }

    const WEBHOOKS = {
        MEDIA_APP: process.env.WEBHOOK_MEDIA_APP || functions.config().discord?.media_app,
        REPORT_PLAYER: process.env.WEBHOOK_REPORT_PLAYER || functions.config().discord?.report_player,
        STAFF_APPLY: process.env.WEBHOOK_STAFF_APPLY || functions.config().discord?.staff_apply,
        UNBAN_APPEAL: process.env.WEBHOOK_UNBAN_APPEAL || functions.config().discord?.unban_appeal
    };

    const url = WEBHOOKS[type];
    if (!url) {
        throw new functions.https.HttpsError("not-found", "Webhook type not found.");
    }

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error(`Discord returned ${response.status}`);
        return { success: true };
    } catch (error) {
        console.error("Failed to send webhook:", error);
        throw new functions.https.HttpsError("internal", "Failed to send webhook.");
    }
});
