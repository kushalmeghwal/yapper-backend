
export default (io) => {
const usersSearching = [];  // Keep track of users searching
const chatRooms = {};

io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("start_search", async ({ userId, mood, choice }) => {
        console.log(`${userId} is searching for ${choice} with mood ${mood}`);
        console.log("📋 Current users searching:", usersSearching);

        const matchedUserIndex = usersSearching.findIndex((user) => 
            user.mood === mood &&
            ((user.choice === "Rizzler" && choice === "Gyatt") || 
            (user.choice === "Gyatt" && choice === "Rizzler"))
        );

        if (matchedUserIndex !== -1) {
            // ✅ Match found
            const matchedUser = usersSearching[matchedUserIndex];
            const chatRoomId = `chat_${matchedUser.userId}_${userId}`;
            chatRooms[chatRoomId] = { users: [matchedUser.userId, userId], messages: [] };

            console.log(`✅ Match found: ${matchedUser.userId} ↔ ${userId}`);

            try {
                // 🔍 Fetch nicknames from DB
                const matchedUserDoc = await User.findById(matchedUser.userId);
                const currentUserDoc = await User.findById(userId);

                const matchedUserNickname = matchedUserDoc?.nickname || "Unknown";
                const currentUserNickname = currentUserDoc?.nickname || "Unknown";

                // ✅ Emit match event to both users
                io.to(matchedUser.socketId).emit("match_found", {
                    chatRoomId,
                    receiverId: userId,
                    receiverNickname: currentUserNickname,  // Send the current user's nickname
                });

                io.to(socket.id).emit("match_found", {
                    chatRoomId,
                    receiverId: matchedUser.userId,
                    receiverNickname: matchedUserNickname,  // Send the matched user's nickname
                });

                // ✅ Remove matched user from searching list
                usersSearching.splice(matchedUserIndex, 1);
            } catch (error) {
                console.error(" Error fetching nicknames:", error);
            }
        } else {
            // ✅ No match, store in waiting list
            usersSearching.push({ userId, mood, choice, socketId: socket.id });
        }
    });

    console.log("Updated users searching:", usersSearching);

    // ✅ Ensure users join the chat room before sending messages
    socket.on("join_chat", ({ chatRoomId }) => {
        socket.join(chatRoomId);
        console.log(`✅ ${socket.id} joined room: ${chatRoomId}`);
    
        // 🛠️ Debugging - List all users in the room
        const roomUsers = io.sockets.adapter.rooms.get(chatRoomId);
        console.log(`📋 Users in ${chatRoomId}:`, roomUsers ? Array.from(roomUsers) : "No users found!");
    });
    

    // ✅ Handle sending messages
    socket.on("send_message", ({ chatRoomId, senderId, message }) => {
        console.log(`📤 Message sent to ${chatRoomId}: ${message} by ${senderId}`);
        const roomUsers = io.sockets.adapter.rooms.get(chatRoomId);
        if (!roomUsers) {
            console.log(`❌ No users in chat room ${chatRoomId}, message not sent`);
            return;
        }
        if (chatRooms[chatRoomId]) {
            chatRooms[chatRoomId].messages.push({ senderId, message });
    
            // ✅ Emit message to all users in the room
            io.to(chatRoomId).emit("receive_message", { senderId, message });
        } else {
            console.log(`❌ Chat room ${chatRoomId} not found!`);
        }
    });
    

    // ✅ Handle user disconnect properly
    socket.on("disconnect", () => {
        console.log("User disconnected:", socket.id);

        // ✅ Remove the user from usersSearching list
        const index = usersSearching.findIndex(user => user.socketId === socket.id);
        if (index !== -1) {
            usersSearching.splice(index, 1);
        }

        // ✅ Remove the user from chatRooms if they were in a chat
        Object.keys(chatRooms).forEach((roomId) => {
            chatRooms[roomId].users = chatRooms[roomId].users.filter(id => id !== socket.id);
            if (chatRooms[roomId].users.length === 0) {
                delete chatRooms[roomId];
            }
        });
    });
});
}