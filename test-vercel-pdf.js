// Test script to simulate Vercel PDF generation
require('dotenv').config();
const mongoose = require('mongoose');

// Simulate Vercel environment
process.env.VERCEL = "1";

async function testVercelPDF() {
    try {
        console.log('🔄 Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ MongoDB connected');

        const { generateBillForDownload } = require('./utils/billGenerator');

        const mockBooking = {
            _id: '507f1f77bcf86cd799439011',
            userName: 'Test User (Vercel Mode)',
            userEmail: 'test@vercel.example.com',
            date: new Date(),
            startTime: '10:00',
            endTime: '12:00',
            duration: 2,
            price: 1000,
            subtotal: 847.46,
            taxAmount: 152.54,
            rentalType: 'Studio Rental',
            bookingStatus: 'CONFIRMED'
        };

        console.log('🚀 Starting Vercel-simulated PDF generation...');
        const buffer = await generateBillForDownload(mockBooking);
        
        console.log('✅ Vercel-mode PDF generated successfully!');
        console.log('📄 PDF size:', buffer.length, 'bytes');
        console.log('📊 PDF size in KB:', (buffer.length / 1024).toFixed(2), 'KB');
        
        // Test if it's a valid PDF (more comprehensive check)
        const pdfStart = buffer.toString('ascii', 0, 4);
        const pdfStartAlt = buffer.toString('utf8', 0, 4);
        console.log('📋 PDF header check:', { pdfStart, pdfStartAlt });
        
        if (buffer.length > 0 && (pdfStart === '%PDF' || pdfStartAlt === '%PDF')) {
            console.log('✅ Generated file is a valid PDF');
        } else {
            console.log('❌ PDF validation failed. First 20 bytes:', buffer.toString('hex', 0, 20));
        }

        // Save the PDF for manual verification
        const fs = require('fs');
        const testPdfPath = './test-vercel-generated.pdf';
        fs.writeFileSync(testPdfPath, buffer);
        console.log('💾 PDF saved as:', testPdfPath, 'for manual verification');

    } catch (error) {
        console.error('❌ Vercel-mode PDF generation failed:');
        console.error('Error:', error.message);
        
        if (error.stack) {
            console.error('Stack trace:', error.stack.split('\n').slice(0, 5).join('\n'));
        }
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Database disconnected');
        process.exit(0);
    }
}

testVercelPDF();