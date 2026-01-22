// ==========================================
// SERVER.JS - WITH ADMIN EDIT/DELETE
// ==========================================
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']); 

const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const session = require('express-session');
const app = express();

app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

app.use(session({
    secret: 'shiva_blood_bank_secret',
    resave: false,
    saveUninitialized: false
}));

// --- MODELS ---
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['Admin', 'Staff'], default: 'Staff' },
    isVerified: { type: Boolean, default: false }
});
const User = mongoose.model('User', userSchema);

const donorSchema = new mongoose.Schema({
    mobile: { type: String, required: true, unique: true },
    name: String,
    fatherName: String,
    gender: { type: String, enum: ['Male', 'Female'] },
    age: Number,
    bloodGroup: String,
    address: String
});
const Donor = mongoose.model('Donor', donorSchema);

const donationSchema = new mongoose.Schema({
    donorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Donor' },
    donationDate: { type: Date, required: true }, 
    bagNumber: String,
    bagType: String,
    donationType: String,
    hiv: { type: String, default: 'Non-Reactive' },
    hbsag: { type: String, default: 'Non-Reactive' },
    hcv: { type: String, default: 'Non-Reactive' },
    syphilis: { type: String, default: 'Non-Reactive' },
    malaria: { type: String, default: 'Non-Reactive' },
    remark: String
});
const Donation = mongoose.model('Donation', donationSchema);

// --- CONNECT ---
// ⚠️ PASSWORD YAHA DALEIN
const mongoURI = 'mongodb+srv://scbcguna:scbcdb2026@cluster0.mgqdj4x.mongodb.net/bloodbank?retryWrites=true&w=majority';

mongoose.connect(mongoURI)
    .then(async () => {
        console.log("✅ MongoDB Connected!");
        const adminExists = await User.findOne({ username: 'admin' });
        if (!adminExists) {
            await new User({ username: "admin", password: "admin123", role: "Admin", isVerified: true }).save();
            console.log("👑 Default Admin Created");
        }
    })
    .catch(err => console.log("❌ DB Error: ", err));

// --- ROUTES ---

app.get('/', (req, res) => {
    if(req.session.userId) {
        return req.session.role === 'Admin' ? res.redirect('/admin-panel') : res.redirect('/dashboard');
    }
    res.render('login');
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ username, password });
    if (user) {
        if (!user.isVerified && user.role === 'Staff') return res.send("<h1>Account Pending Verification</h1>");
        req.session.userId = user._id;
        req.session.role = user.role;
        res.redirect(user.role === 'Admin' ? '/admin-panel' : '/dashboard');
    } else {
        res.send("<script>alert('Wrong Password'); window.location.href='/';</script>");
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

app.get('/signup', (req, res) => res.render('signup'));
app.post('/signup', async (req, res) => {
    try {
        await new User({ ...req.body, role: 'Staff', isVerified: false }).save();
        res.send("<h1>Request Sent! <a href='/'>Login</a></h1>");
    } catch(e) { res.send("Error: " + e); }
});

app.get('/admin-panel', async (req, res) => {
    if(req.session.role !== 'Admin') return res.send("Access Denied");
    const pendingStaff = await User.find({ role: 'Staff', isVerified: false });
    const totalDonors = await Donor.countDocuments();
    const totalDonations = await Donation.countDocuments();
    const allStaff = await User.find({ role: 'Staff' });
    res.render('admin_dashboard', { pendingStaff, totalDonors, totalDonations, allStaff });
});

app.get('/all-records', async (req, res) => {
    if(req.session.role !== 'Admin') return res.send("Access Denied");
    const donations = await Donation.find().populate('donorId').sort({ donationDate: -1 });
    res.render('all_records', { donations });
});

// --- NEW ADMIN FEATURES (DELETE & EDIT) ---

// 1. DELETE DONATION
app.get('/delete-donation/:id', async (req, res) => {
    if(req.session.role !== 'Admin') return res.send("<h1>Access Denied! Only Admin can delete.</h1>");
    
    await Donation.findByIdAndDelete(req.params.id);
    res.redirect('/all-records');
});

// 2. OPEN EDIT PAGE
app.get('/edit-donation/:id', async (req, res) => {
    if(req.session.role !== 'Admin') return res.send("<h1>Access Denied! Only Admin can edit.</h1>");
    
    // Donation dhundo aur Donor data bhi sath me lao
    const donation = await Donation.findById(req.params.id).populate('donorId');
    res.render('edit_donation', { donation, donor: donation.donorId });
});

// 3. SAVE EDITED DATA
app.post('/update-donation/:id', async (req, res) => {
    if(req.session.role !== 'Admin') return res.send("Access Denied");
    
    try {
        // Step A: Update Donor Personal Info
        await Donor.findByIdAndUpdate(req.body.donorId, {
            name: req.body.name,
            fatherName: req.body.fatherName,
            age: req.body.age,
            gender: req.body.gender,
            bloodGroup: req.body.bloodGroup,
            address: req.body.address
        });

        // Step B: Update Donation Info
        await Donation.findByIdAndUpdate(req.params.id, {
            bagNumber: req.body.bagNumber,
            donationType: req.body.donationType,
            hiv: req.body.hiv,
            hbsag: req.body.hbsag,
            hcv: req.body.hcv,
            syphilis: req.body.syphilis,
            malaria: req.body.malaria
        });

        res.redirect('/all-records');
    } catch(err) {
        res.send("Update Error: " + err);
    }
});
// ------------------------------------------

app.get('/verify-staff/:id', async (req, res) => {
    if(req.session.role !== 'Admin') return res.send("Not Allowed");
    await User.findByIdAndUpdate(req.params.id, { isVerified: true });
    res.redirect('/admin-panel');
});

app.get('/delete-user/:id', async (req, res) => {
    if(req.session.role !== 'Admin') return res.send("Not Allowed");
    await User.findByIdAndDelete(req.params.id);
    res.redirect('/admin-panel');
});

app.get('/dashboard', (req, res) => {
    if(!req.session.userId) return res.redirect('/');
    res.render('dashboard', { role: req.session.role });
});

// --- SEARCH & SAVE (Same as before) ---
// ==========================================
// 🔍 SEARCH DONOR ROUTE (UPDATED LOGIC)
// ==========================================
app.post('/search', async (req, res) => {
    try {
        const mobile = req.body.mobile;

        // 1. Mobile Number Check
        if (!mobile || mobile.length !== 10) {
            return res.send(`
                <script>
                    alert("⚠️ Error: Mobile Number must be 10 digits!");
                    window.location.href = "/dashboard";
                </script>
            `);
        }

        // 2. Database se Donor dhundo
        const donor = await Donor.findOne({ mobile: mobile });
        
        let history = [];
        let isBlocked = false;       // Red Alert ke liye
        let isWarning = false;       // Yellow Alert ke liye
        let alertMessage = "";

        if (donor) {
            // Purani history nikalo (Newest first)
            history = await Donation.find({ donorId: donor._id }).sort({ donationDate: -1 });
            
            if (history.length > 0) {
                const lastDonation = history[0];
                
                // --- RULE 1: GAP CHECK (3 Months Male / 4 Months Female) ---
                const diffTime = Math.abs(new Date() - lastDonation.donationDate);
                const diffMonths = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) / 30.44; 

                if (donor.gender === 'Male' && diffMonths < 3) {
                    isBlocked = true;
                    alertMessage = STOP: Male Donor. Last donation was only ${diffMonths.toFixed(1)} months ago. (Gap < 3 months);
                }
                else if (donor.gender === 'Female' && diffMonths < 4) {
                    isBlocked = true;
                    alertMessage = STOP: Female Donor. Last donation was only ${diffMonths.toFixed(1)} months ago. (Gap < 4 months);
                }

                // --- RULE 2: PERMANENT BLOCK (HIV, HBsAg, HCV, Syphilis) ---
                // Malaria ko yahan se hata diya hai
                else if (['Reactive'].includes(lastDonation.hiv) || 
                    ['Reactive'].includes(lastDonation.hbsag) || 
                    ['Reactive'].includes(lastDonation.hcv) || 
                    ['Reactive'].includes(lastDonation.syphilis)) {
                    
                    isBlocked = true;
                    alertMessage = "CRITICAL MEDICAL ALERT: Previous History was REACTIVE for TTI (HIV/HBsAg/HCV/Syphilis). Donation Blocked.";
                }

                // --- RULE 3: MALARIA WARNING (Yellow Alert) ---
                // Agar Block nahi hai, tabhi Malaria check karega
                else if (lastDonation.malaria === 'Reactive') {
                    isWarning = true;
                    alertMessage = "Previous Donation was MALARIA POSITIVE. Please verify current medical fitness before donation.";
                }
            }
        }
        
        // Agar naya donor hai (database me nahi hai), to temporary object banao
        const donorData = donor || { mobile: mobile, name: '', fatherName: '', age: '', gender: '', bloodGroup: '', address: '' };

        // Form Render karo (Variables bhej rahe hain)
        res.render('donationForm', { 
            donor: donorData, 
            history: history, 
            isBlocked: isBlocked, 
            isWarning: isWarning, 
            alertMessage: alertMessage 
        });

    } catch (error) {
        console.error(error);
        res.send("Server Error: Something went wrong.");
    }
});
app.post('/save-donation', async (req, res) => {
    try {
        if (req.body.mobile.length !== 10) return res.send("Error: Mobile must be 10 digits");
        const inputDate = new Date(req.body.donationDate);
        let donor = await Donor.findOne({ mobile: req.body.mobile });

        if (donor) {
            const history = await Donation.find({ donorId: donor._id }).sort({ donationDate: -1 });
            if (history.length > 0) {
                const monthsDiff = (inputDate - history[0].donationDate) / (1000 * 60 * 60 * 24 * 30.44);
                if ((donor.gender === 'Male' && monthsDiff < 3) || (donor.gender === 'Female' && monthsDiff < 4)) 
                    return res.send("<h1>STOP: Gap Rule Violation <a href='/dashboard'>Back</a></h1>");
                if (['Reactive'].includes(history[0].hiv) || ['Reactive'].includes(history[0].hbsag)) 
                    return res.send("<h1>STOP: Reactive History <a href='/dashboard'>Back</a></h1>");
            }
        }

        if (!donor) {
            donor = new Donor(req.body);
            await donor.save();
        } else {
            donor.age = req.body.age; 
            await donor.save();
        }

        const newDonation = new Donation({
            donorId: donor._id,
            donationDate: inputDate,
            bagNumber: req.body.bagNumber,
            bagType: req.body.bagType,
            donationType: req.body.donationType,
            hiv: req.body.hiv,
            hbsag: req.body.hbsag,
            hcv: req.body.hcv,
            syphilis: req.body.syphilis,
            malaria: req.body.malaria,
            remark: req.body.remark
        });

        await newDonation.save();
        res.send("<h1>✅ Saved!</h1><a href='/dashboard'>Next</a>");
    } catch (err) { res.send("Error: " + err); }
});

const PORT = process.env.PORT || 3000;
// --- KEEPER ALIVE ROUTE (For Cron-Job) ---
app.get('/ping', (req, res) => {
    res.send('Wake up!');
});

app.listen(PORT, () => {
    // Ye line change ki hai (Safe Tarika)
    console.log("Server is running on port " + PORT);
});


