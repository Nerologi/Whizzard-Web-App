// --- Admin Dashboard Data Endpoint ---
// Returns all users, sites, vehicles, and trips for admin dashboard
apiRouter.get('/data', async (req, res) => {
    try {
        // Optionally, you can add authentication middleware here
        // For now, check role by mobile in query (frontend must send ?mobile=...)
        const { mobile } = req.query;
        if (!mobile) {
            return res.status(400).json({ message: 'Mobile number is required for admin data access.' });
        }
        const user = await User.findOne({ userMobile: mobile });
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }
        const allowedRoles = ['Admin', 'System Admin', 'Super Admin'];
        if (!allowedRoles.includes(user.userRole)) {
            return res.status(403).json({ message: 'Access denied. Only admins can access this data.' });
        }
        // Fetch all data
        const [users, sites, vehicles, trips] = await Promise.all([
            User.find({}),
            SiteCode.find({}),
            Vehicle.find({}),
            Trip.find({})
        ]);
        res.json({ users, sites, vehicles, trips });
    } catch (error) {
        console.error('Error fetching admin data:', error);
        res.status(500).json({ message: 'Failed to fetch admin data', error: error.message });
    }
});
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet'); 
const bcrypt = require('bcrypt'); 

const app = express();

// --- Middleware ---
const corsOptions = {
    origin: process.env.NODE_ENV === 'production' ? 'https://whizzard-ev.com' : '*',
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(helmet()); // Basic security headers

// --- MongoDB Connection ---
// mongoose.connect(process.env.MONGODB_URI)
//     .then(() => console.log('Successfully connected to MongoDB Atlas!'))
//     .catch(err => console.error('MongoDB connection error:', err));
// Commented out for demonstration purposes if you don't have the URI set up.

// --- Mongoose Schema Helper ---
function configureSchema(schema) {
    schema.set('toJSON', {
        virtuals: true,
        versionKey: false,
        transform: function (doc, ret) {
            delete ret._id;
        }
    });
}

// --- Mongoose Schemas & Models (Copied from your provided code) ---

const UserSchema = new mongoose.Schema({
    userName: String,
    userMobile: { type: String, unique: true, required: true },
    userRole: String,
    password: { type: String }, 
    currentStatus: { type: String, default: 'Pending' },
});
UserSchema.pre('save', async function(next) {
    if (!this.isModified('password') || !this.password) return next();
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});
UserSchema.set('toJSON', {
    virtuals: true,
    versionKey: false,
    transform: function (doc, ret) {
        delete ret._id;
        delete ret.password;
    }
});
const User = mongoose.model('user', UserSchema);

const SiteCodeSchema = new mongoose.Schema({
    siteCodeInput: { type: String, unique: true },
    clientName: String,
    cityName: String,
    address: String,
    siteOMName: String,
    omMobileNumber: String,
    siteRMName: String,
    rmMobileNumber: String,
    state: String,
    region: String,
    edelPOC: String,
    edelPOCMobileNumber: String,
    currentStatus: { type: String, default: 'Pending' }
});
configureSchema(SiteCodeSchema);
const SiteCode = mongoose.model('site_code', SiteCodeSchema);

const VehicleSchema = new mongoose.Schema({
    vehicleNo: { type: String, unique: true },
    vehicleType: String,
    vehicleOEM: String,
    siteCode: String,
    clientName: String,
    region: String,
    omName: String,
    rmName: String,
    vehicleRent: Number,
    currentStatus: { type: String, default: 'Pending' },
    activationDate: String,
    breakdownDate: String,
});
configureSchema(VehicleSchema);
const Vehicle = mongoose.model('vehicle', VehicleSchema);

const TripSchema = new mongoose.Schema({
    _id: String, // Using custom composite ID
    date: String,
    vehicleNo: String,
    siteCode: String,
    clientName: String,
    omName: String,
    rmName: String,
    status: { type: String, default: 'Pending' },
    rejectionReason: String,
    verifiedBy: String,
}, { _id: false });

TripSchema.set('toJSON', {
    virtuals: true,
    versionKey: false,
    transform: function (doc, ret) {
        // Since _id is false, we don't need to delete it.
        // We manually assign 'id' to be the same as the custom '_id' for frontend convenience
        ret.id = doc._id;
    }
});
const Trip = mongoose.model('trip', TripSchema);


// --- API Endpoints ---
const apiRouter = express.Router();

// Your existing routes (GET all, POST one, etc.) are kept here...
// ... (omitted for brevity, assume your existing routes from your file are here)

// Generic UPDATE a document
const updateOne = (model) => async (req, res) => {
    try {
        const { id } = req.params;
        // Trip model has a custom string _id, so we can't use FindById
        const query = model.modelName === 'trip' ? { _id: id } : { _id: mongoose.Types.ObjectId(id) };
        
        const updatedItem = await model.findOneAndUpdate(query, req.body, { new: true });

        if (!updatedItem) return res.status(404).json({ message: 'Item not found' });
        res.json(updatedItem);
    } catch (error) {
        console.error(`Error updating in ${model.modelName}:`, error);
        res.status(400).json({ message: error.message || 'Bad request' });
    }
};

apiRouter.put('/trips/:id', updateOne(Trip));


// --- NEW ENDPOINT FOR OM APP ---
apiRouter.get('/om-data', async (req, res) => {
    try {
        const { omMobile } = req.query;
        if (!omMobile) {
            return res.status(400).json({ message: "Operation Manager's mobile number is required." });
        }
        
        // 1. Find all active sites managed by this OM
        const managedSites = await SiteCode.find({ 
            omMobileNumber: omMobile, 
            currentStatus: 'Active' 
        });

        if (managedSites.length === 0) {
            return res.json({ sites: [], trips: [] });
        }

        // 2. Get the list of site codes from the managed sites
        const siteCodes = managedSites.map(s => s.siteCodeInput);

        // 3. Find all trips associated with those site codes
        const associatedTrips = await Trip.find({ siteCode: { $in: siteCodes } });
        
        // 4. Send back the sites and their associated trips
        res.json({ sites: managedSites, trips: associatedTrips });

    } catch (error) {
        console.error("Error fetching OM data:", error);
        res.status(500).json({ message: 'Failed to fetch manager data', error: error.message });
    }
});


// --- Login Route (Your existing login route is perfect) ---
apiRouter.post('/login', async (req, res) => {
    try {
        const { mobile, password } = req.body;
        if (!mobile || !password) {
            return res.status(400).json({ message: "Mobile number and password are required." });
        }
        const user = await User.findOne({ userMobile: mobile }).select('+password'); 
        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }
        if (!user.password) {
             return res.status(401).json({ message: "Invalid credentials. Account has no password set." });
        }
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: "Invalid credentials." });
        }
        if (user.currentStatus !== 'Active') {
            return res.status(403).json({ message: "User account is not active." });
        }
        const userData = user.toJSON();
        res.json({ message: "Login successful", user: userData });
    } catch (error) {
        console.error("Error during login:", error);
        res.status(500).json({ message: "An internal server error occurred during login.", error: error.message || 'Unknown error' });
    }
});


app.use('/api', apiRouter);

// --- Start Server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

module.exports = app;