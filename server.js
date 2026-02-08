
// SERVER.JS - FINAL UPDATE (Mobile/Aadhaar + Bulk Upload)
// ==========================================
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']); 

const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const session = require('express-session');
const multer = require('multer');       // 📂 File Upload ke liye
const csv = require('csv-parser');      // 📂 CSV padhne ke liye
const fs = require('fs');               // 📂 File system ke liye

const app = express();
const upload = multer({ dest: 'uploads/' }); // Temp folder for uploads

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
    // ✅ UNIQUE: Mobile aur Aadhaar duplicate nahi ho sakte
    mobile: { type: String, required: true, unique: true },
    aadhaar: { type: String, unique: true, sparse: true }, // Sparse: Jinka aadhaar nahi hai wo error nahi dega
    
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
    remark: String,
    enteredBy: String 
});
const Donation = mongoose.model('Donation', donationSchema);

// --- CONNECT ---
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

// ✅ LOGIN FIXED (Session Order Corrected)
app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username, password });
        if (user) {
            if (!user.isVerified && user.role === 'Staff') return res.send("<h1>Account Pending Verification</h1>");
            
            // Session values pehle set karein
            req.session.userId = user._id;
            req.session.role = user.role;
            req.session.staffName = user.username;
            
            // Save hone ke baad redirect karein
            req.session.save(() => {
                res.redirect(user.role === 'Admin' ? '/admin-panel' : '/dashboard');
            });
        } else {
            res.send("<script>alert('Wrong Password'); window.location.href='/';</script>");
        }
    } catch (e) { res.send("Error: " + e); }
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

// --- ADMIN FEATURES ---

app.get('/delete-donation/:id', async (req, res) => {
    if(req.session.role !== 'Admin') return res.send("<h1>Access Denied! Only Admin can delete.</h1>");
    await Donation.findByIdAndDelete(req.params.id);
    res.redirect('/all-records');
});

app.get('/edit-donation/:id', async (req, res) => {
    if(req.session.role !== 'Admin') return res.send("<h1>Access Denied! Only Admin can edit.</h1>");
    const donation = await Donation.findById(req.params.id).populate('donorId');
    res.render('edit_donation', { donation, donor: donation.donorId });
});

app.post('/update-donation/:id', async (req, res) => {
    if(req.session.role !== 'Admin') return res.send("Access Denied");
    try {
        await Donor.findByIdAndUpdate(req.body.donorId, {
            name: req.body.name,
            fatherName: req.body.fatherName,
            age: req.body.age,
            gender: req.body.gender,
            bloodGroup: req.body.bloodGroup,
            address: req.body.address,
            aadhaar: req.body.aadhaar // Aadhaar bhi update hoga
        });
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
    } catch(err) { res.send("Update Error: " + err); }
});

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

// ==========================================
// 🔍 SMART SEARCH (Mobile OR Aadhaar)
// ==========================================
app.post('/search', async (req, res) => {
    try {
        const inputData = req.body.mobile; // Form me name="mobile" hi hai

        // Check: 10 digit (Mobile) ya 12 digit (Aadhaar)
        if (!inputData || (inputData.length !== 10 && inputData.length !== 12)) {
            return res.send(<script>alert("⚠️ Error: Please enter valid 10-digit Mobile OR 12-digit Aadhaar Number!"); window.location.href = "/dashboard";</script>);
        }

        // Search in BOTH fields
        const donor = await Donor.findOne({
            $or: [
                { mobile: inputData }, 
                { aadhaar: inputData }
            ]
        });
        
        let history = [];
        let isBlocked = false;
        let alertMessage = "";

        if (donor) {
            history = await Donation.find({ donorId: donor._id }).sort({ donationDate: -1 });
            
            if (history.length > 0) {
                const lastDonation = history[0];
                const diffTime = Math.abs(new Date() - lastDonation.donationDate);
                const diffMonths = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) / 30.44; 

                if (donor.gender === 'Male' && diffMonths < 3) {
                    isBlocked = true;
                    alertMessage = "STOP: Male Donor. Less than 3 months gap.";
                }
                if (donor.gender === 'Female' && diffMonths < 4) {
                    isBlocked = true;
                    alertMessage = "STOP: Female Donor. Less than 4 months gap.";
                }
                if (['Reactive'].includes(lastDonation.hiv) || ['Reactive'].includes(lastDonation.hbsag) || 
                    ['Reactive'].includes(lastDonation.hcv) || ['Reactive'].includes(lastDonation.syphilis)) {
                    isBlocked = true;
                    alertMessage = "CRITICAL ALERT: Previous History was REACTIVE.";
                }
            }
        }
        
        // Pass Data to Form
        let initialData = donor || { 
            name: '', fatherName: '', age: '', gender: '', bloodGroup: '', address: '',
            mobile: (inputData.length === 10 ? inputData : ''), 
            aadhaar: (inputData.length === 12 ? inputData : '') 
        };

        res.render('donationForm', { 
            donor: initialData, 
            history: history, 
            isBlocked: isBlocked, 
            alertMessage: alertMessage 
        });

    } catch (error) {
        console.error("Search Error:", error);
        res.send("Server Error");
    }
});

// ==========================================
// 💾 SAVE DONATION (Updated for Aadhaar)
// ==========================================
app.post('/save-donation', async (req, res) => {
    try {
        const inputDate = new Date(req.body.donationDate);
        
        // Mobile ya Aadhaar se donor dhundo
        let donor = await Donor.findOne({
            $or: [
                { mobile: req.body.mobile },
                { aadhaar: req.body.aadhaar }
            ]
        });

        // Rules Check (Agar donor mila)
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

        // Agar Naya Donor hai to Create karo
        if (!donor) {
            donor = new Donor({
                ...req.body,
                aadhaar: req.body.aadhaar // Aadhaar bhi save karo
            });
            await donor.save();
        } else {
            // Update details (Age, Aadhaar etc.)
            donor.age = req.body.age; 
            if(req.body.aadhaar) donor.aadhaar = req.body.aadhaar;
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
            remark: req.body.remark,
            enteredBy: req.session.staffName || "Admin"
        });

        await newDonation.save();
        res.send("<h1>✅ Saved!</h1><a href='/dashboard'>Next</a>");
    } catch (err) { res.send("Error: " + err); }
});

// ==========================================
// 📤 BULK IMPORT ROUTE (Excel/CSV)
// ==========================================
app.post('/import-data', upload.single('file'), async (req, res) => {
    if(!req.file) return res.send("Please upload a file");
    
    const results = [];
    fs.createReadStream(req.file.path)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', async () => {
            try {
                let successCount = 0;
                for (let row of results) {
                    // Check Logic: Mobile ya Aadhaar match?
                    let donor = await Donor.findOne({ 
                        $or: [
                            { mobile: row.Mobile || row.mobile }, 
                            { aadhaar: row.Aadhaar || row.aadhaar }
                        ] 
                    });

                    // Agar Donor nahi hai, to Naya Banao
                    if (!donor) {
                        // Validate Mobile (Kam se kam mobile hona zaruri hai)
                        if(!row.Mobile && !row.mobile) continue; 
                        
                        donor = new Donor({
                            name: row.Name || row.name,
                            mobile: row.Mobile || row.mobile,
                            aadhaar: row.Aadhaar || row.aadhaar,
                            bloodGroup: row.BloodGroup || row.bloodGroup,
                            address: row.Address || row.address,
                            gender: row.Gender || row.gender,
                            age: row.Age || row.age,
                            fatherName: row.FatherName || row.fatherName
                        });
                        await donor.save();
                    }

                    // Donation Entry Add karo
                    if (row.Date || row.date) {
                        const newDonation = new Donation({
                            donorId: donor._id,
                            donationDate: new Date(row.Date || row.date),
                            bagNumber: row.BagNo || 'Old Record',
                            bloodGroup: donor.bloodGroup,
                            donationType: 'Voluntary',
                            mobile: donor.mobile,
                            enteredBy: 'Bulk Import'
                        });
                        await newDonation.save();
                    }
                    successCount++;
                }

                fs.unlinkSync(req.file.path); // Clean up temp file
                res.send(<script>alert("✅ ${successCount} Records Imported!"); window.location.href = "/admin-panel";</script>);

            } catch (error) {
                console.error(error);
                res.send("Error in Import: " + error.message);
            }
        });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log("Server is running on port " + PORT);
});
