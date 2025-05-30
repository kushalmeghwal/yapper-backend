import multer from "multer";
import path from "path";

// Configure storage for uploaded files
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, "uploads/files"); // Uploads will be saved in the "uploads" folder
    },
    filename: function (req, file, cb) {
        cb(null, file.fieldname + "-" + Date.now() + path.extname(file.originalname));
    }
});

// Multer middleware
const upload = multer({ storage });

export default upload;//import it someware and use it to store files in local or cloude