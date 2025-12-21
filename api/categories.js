const express = require("express");
const router = express.Router();
const bodyParser = require("body-parser");
const dbManager = require('./db-manager');

router.use(bodyParser.json());

module.exports = router;

// Initialize database asynchronously
let categoryDB;

// Initialize database when module loads
(async function() {
    try {
        categoryDB = await dbManager.getDatabase("categories.db");
        categoryDB.ensureIndex({ fieldName: "_id", unique: true });
        console.log("Categories database initialized successfully");
    } catch (error) {
        console.error("Failed to initialize categories database:", error);
    }
})();

/**
 * GET endpoint: Get the welcome message for the Category API.
 *
 * @param {Object} req  request object.
 * @param {Object} res  response object.
 * @returns {void}
 */
router.get("/", function (req, res) {
    res.send("Category API");
});

/**
 * GET endpoint: Get details of all categories.
 *
 * @param {Object} req  request object.
 * @param {Object} res  response object.
 * @returns {void}
 */
router.get("/all", function (req, res) {
    categoryDB.find({}, function (err, docs) {
        res.send(docs);
    });
});

/**
 * POST endpoint: Create a new category.
 *
 * @param {Object} req  request object with new category data in the body.
 * @param {Object} res  response object.
 * @returns {void}
 */
router.post("/category", function (req, res) {
    let newCategory = req.body;
    newCategory._id = Math.floor(Date.now() / 1000);
    categoryDB.insert(newCategory, function (err, category) {
            if (err) {
                    console.error(err);
                    res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
        else{res.sendStatus(200);}
    });
});

/**
 * DELETE endpoint: Delete a category by category ID.
 *
 * @param {Object} req  request object with category ID as a parameter.
 * @param {Object} res  response object.
 * @returns {void}
 */
router.delete("/category/:categoryId", function (req, res) {
    categoryDB.remove(
        {
            _id: parseInt(req.params.categoryId),
        },
        function (err, numRemoved) {
                if (err) {
                    console.error(err);
                    res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
            else{res.sendStatus(200);}
        },
    );
});

/**
 * PUT endpoint: Update category details.
 *
 * @param {Object} req  request object with updated category data in the body.
 * @param {Object} res  response object.
 * @returns {void}
 */
router.put("/category", function (req, res) {
    categoryDB.update(
        {
            _id: parseInt(req.body.id),
        },
        req.body,
        {},
        function (err, numReplaced, category) {
                if (err) {
                    console.error(err);
                    res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
            else{res.sendStatus(200);}
        },
    );
});
