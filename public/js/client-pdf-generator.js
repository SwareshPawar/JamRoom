/**
 * Client-Side PDF Generation
 * This generates PDFs using the unified HTML template for consistency
 */

// Load external libraries dynamically
function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

// Initialize PDF libraries
let pdfLibsLoaded = false;
async function loadPDFLibraries() {
    if (pdfLibsLoaded) return;
    
    try {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js');
        // Load the unified PDF template
        await loadScript('js/pdfHTMLTemplate.js');
        pdfLibsLoaded = true;
        console.log('✅ PDF libraries loaded successfully');
    } catch (error) {
        console.error('❌ Failed to load PDF libraries:', error);
        throw error;
    }
}

/**
 * Generate PDF from booking data (client-side)
 */
async function generatePDFClient(booking, settings) {
    console.log('🔍 generatePDFClient called with:', {
        bookingId: booking?._id,
        hasSettings: !!settings,
        studioName: settings?.studioName,
        studioAddress: settings?.studioAddress,
        studioPhone: settings?.studioPhone
    });
    
    await loadPDFLibraries();
    
    console.log('📄 Starting client-side PDF generation...');
    
    // Generate HTML content using unified template
    const htmlContent = generateUnifiedPDFHTML(booking, settings);
    console.log('✅ HTML content generated, length:', htmlContent.length);
    
    // Create a temporary container that matches server-side rendering
    const tempContainer = document.createElement('div');
    tempContainer.innerHTML = htmlContent;
    tempContainer.style.position = 'absolute';
    tempContainer.style.left = '-9999px';
    tempContainer.style.top = '0';
    tempContainer.style.width = '800px';
    tempContainer.style.height = 'auto';
    document.body.appendChild(tempContainer);
    
    // Wait for fonts and styles to load
    await new Promise(resolve => setTimeout(resolve, 300));
    
    const invoiceElement = tempContainer.querySelector('.sheet') || tempContainer.firstElementChild;
    if (!invoiceElement) {
        throw new Error('Unable to locate PDF root element in generated HTML');
    }
    
    const options = {
        margin: [0.28, 0.28, 0.28, 0.28], // 20px converted to inches (20/72 ≈ 0.28)
        filename: `JamRoom_Invoice_${booking._id.toString().slice(-6).toUpperCase()}_${new Date(booking.date).toISOString().split('T')[0]}.pdf`,
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { 
            scale: 2, 
            useCORS: true, 
            allowTaint: true,
            backgroundColor: '#f7fafc',
            width: 800,
            height: invoiceElement.scrollHeight,
            scrollX: 0,
            scrollY: 0,
            logging: false
        },
        jsPDF: { 
            unit: 'in', 
            format: 'a4', 
            orientation: 'portrait',
            compress: true
        }
    };
    
    try {
        await html2pdf().from(invoiceElement).set(options).save();
        console.log('✅ Client-side PDF generated successfully');
        
        // Clean up
        document.body.removeChild(tempContainer);
        
        return true;
    } catch (error) {
        console.error('❌ Client-side PDF generation failed:', error);
        document.body.removeChild(tempContainer);
        throw error;
    }
}

// Export for use in HTML pages
window.generatePDFClient = generatePDFClient;
