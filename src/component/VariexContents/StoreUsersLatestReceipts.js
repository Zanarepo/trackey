import React, { useState, useEffect, useRef } from 'react';
import { supabase } from "../../supabaseClient";
import { FaEdit, FaTrashAlt, FaPrint, FaDownload, FaWhatsapp } from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const tooltipVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

export default function ReceiptManager() {
  const storeId = localStorage.getItem("store_id");
  const [store, setStore] = useState(null);
  const [saleGroupsList, setSaleGroupsList] = useState([]);
  const [selectedSaleGroup, setSelectedSaleGroup] = useState(null);
  const [receipts, setReceipts] = useState([]);
  const [filteredReceipts, setFilteredReceipts] = useState([]);
  const [searchTerm] = useState('');
  const [editing, setEditing] = useState(null);
  const [salesSearch, setSalesSearch] = useState('');
  const [sortKey, setSortKey] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');
  const [form, setForm] = useState({ customer_name: "", customer_address: "", phone_number: "", warranty: "" });
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [showSaleGroups, setShowSaleGroups] = useState(true);
  const [showReceipts, setShowReceipts] = useState(true);
  const [currentSaleGroupsPage, setCurrentSaleGroupsPage] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [action, setAction] = useState(null);
  const saleGroupsPerPage = 30;
  const itemsPerPage = 30;

  const [headerBgColor, setHeaderBgColor] = useState('#1E3A8A');
  const [headerTextColor, setHeaderTextColor] = useState('#FFFFFF');
  const [headerFont, setHeaderFont] = useState('font-serif');
  const [bodyFont, setBodyFont] = useState('font-sans');
  const [watermarkColor, setWatermarkColor] = useState('rgba(30,58,138,0.1)');

  const printRef = useRef();
  const receiptsRef = useRef();
  const saleGroupsRef = useRef();

  const onboardingSteps = [
    {
      target: '.sales-search',
      content: 'Search for sale receipt by ID, amount, or payment method.',
    },
    {
      target: '.sort-id',
      content: 'Sort sale receipts by ID to organize your data.',
    },
    {
      target: filteredReceipts.length > 0 ? '.edit-receipt-0' : '.sales-search',
      content: filteredReceipts.length > 0 ? 'Edit receipt details like customer name or warranty.' : 'Select a sale details to view and edit receipts save it, print or download.',
    },
    {
      target: filteredReceipts.length > 0 ? '.generate-receipt-0' : '.sales-search',
      content: filteredReceipts.length > 0 ? 'Generate receipt to print, share via WhatsApp, or download.' : 'Select a sale details to view and edit receipts save it, print or download.',
    },
  ];

  useEffect(() => {
    if (!localStorage.getItem('receiptManagerOnboardingCompleted')) {
      const timer = setTimeout(() => {
        setShowOnboarding(true);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    if (!storeId) return;
    supabase
      .from("stores")
      .select("shop_name,business_address,phone_number")
      .eq("id", storeId)
      .single()
      .then(({ data }) => setStore(data));
  }, [storeId]);

  useEffect(() => {
    if (!storeId) return;
    supabase
      .from('sale_groups')
      .select(`
        id,
        store_id,
        total_amount,
        payment_method,
        created_at,
        dynamic_sales (
          id,
          device_id,
          quantity,
          amount,
          sale_group_id,
          dynamic_product (
            id,
            name,
            selling_price,
            dynamic_product_imeis
          )
        )
      `)
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          console.error('Error fetching sale groups:', error);
          return;
        }
        setSaleGroupsList(data || []);
      });
  }, [storeId]);

 
 
  useEffect(() => {
  if (!selectedSaleGroup) {
    setReceipts([]);
    return;
  }
  (async () => {
    let { data: receiptData } = await supabase
      .from("receipts")
      .select("*")
      .eq("sale_group_id", selectedSaleGroup.id)
      .order('id', { ascending: false });

    if (receiptData.length === 0 && selectedSaleGroup.dynamic_sales?.length > 0) {
      const firstSale = selectedSaleGroup.dynamic_sales[0];
      const totalQuantity = selectedSaleGroup.dynamic_sales.reduce((sum, sale) => {
        return sum + sale.quantity; // Use sale.quantity instead of deviceIds.length
      }, 0);
      const deviceIds = selectedSaleGroup.dynamic_sales
        .flatMap(sale => sale.device_id?.split(',').filter(id => id.trim()) || [])
        .join(',') || null; // Aggregate device_ids from sales
      const receiptInsert = {
        store_receipt_id: selectedSaleGroup.store_id,
        sale_group_id: selectedSaleGroup.id,
        product_id: firstSale.dynamic_product.id,
        sales_amount: selectedSaleGroup.total_amount,
        sales_qty: totalQuantity,
        product_name: firstSale.dynamic_product.name,
        device_id: deviceIds,
        customer_name: "",
        customer_address: "",
        phone_number: "",
        warranty: "",
        date: new Date(selectedSaleGroup.created_at).toISOString(),
        receipt_id: `RCPT-${selectedSaleGroup.id}-${Date.now()}`
      };

      const { data: newReceipt } = await supabase
        .from("receipts")
        .insert([receiptInsert])
        .select()
        .single();
      receiptData = [newReceipt];
    }

    if (receiptData.length > 1) {
      const [latestReceipt] = receiptData;
      await supabase
        .from("receipts")
        .delete()
        .eq("sale_group_id", selectedSaleGroup.id)
        .neq("id", latestReceipt.id);
      receiptData = [latestReceipt];
    }

    setReceipts(receiptData || []);
  })();
}, [selectedSaleGroup]);





  useEffect(() => {
    const term = searchTerm.toLowerCase();
    const dateStr = selectedSaleGroup ? new Date(selectedSaleGroup.created_at).toLocaleDateString().toLowerCase() : '';
    setFilteredReceipts(
      receipts.filter(r => {
        const fields = [
          r.receipt_id,
          String(r.sale_group_id),
          r.product_name,
          String(r.sales_qty),
          r.device_id,
          r.sales_amount != null ? `₦${r.sales_amount.toFixed(2)}` : '',
          r.customer_name,
          r.customer_address,
          r.phone_number,
          r.warranty,
          dateStr
        ];
        return fields.some(f => f?.toString().toLowerCase().includes(term));
      })
    );
    setCurrentPage(1);
  }, [searchTerm, receipts, selectedSaleGroup]);

  useEffect(() => {
    if (receiptsRef.current && showReceipts) {
      receiptsRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [receipts, showReceipts]);

  useEffect(() => {
    if (saleGroupsRef.current && showSaleGroups) {
      saleGroupsRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [saleGroupsList, showSaleGroups]);

  const handleNextStep = () => {
    if (onboardingStep < onboardingSteps.length - 1) {
      setOnboardingStep(onboardingStep + 1);
    } else {
      setShowOnboarding(false);
      localStorage.setItem('receiptManagerOnboardingCompleted', 'true');
    }
  };

  const handleSkipOnboarding = () => {
    setShowOnboarding(false);
    localStorage.setItem('receiptManagerOnboardingCompleted', 'true');
  };

  const getTooltipPosition = (target) => {
    const element = document.querySelector(target);
    if (!element) return { top: 0, left: 0 };
    const rect = element.getBoundingClientRect();
    return {
      top: rect.bottom + window.scrollY + 10,
      left: rect.left + window.scrollX,
    };
  };

  const handleChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));
  const openEdit = r => {
    setEditing(r);
    setForm({
      customer_name: r.customer_name || "",
      customer_address: r.customer_address || "",
      phone_number: r.phone_number || "",
      warranty: r.warranty || ""
    });
  };
  const saveReceipt = async () => {
    await supabase.from("receipts").update({ ...editing, ...form }).eq("id", editing.id);
    setEditing(null);
    setForm({ customer_name: "", customer_address: "", phone_number: "", warranty: "" });
    const { data } = await supabase
      .from("receipts")
      .select("*")
      .eq("sale_group_id", selectedSaleGroup.id)
      .order('id', { ascending: false });
    setReceipts(data);
  };

  const applyPrintStyles = () => {
    // Store original styles to revert later
    const bodyChildren = document.body.children;
    const printArea = printRef.current;
    const originalStyles = new Map();

    // Hide all elements except .printable-area
    Array.from(bodyChildren).forEach(child => {
      if (!child.classList.contains('printable-area')) {
        originalStyles.set(child, child.style.visibility);
        child.style.visibility = 'hidden';
      }
    });

    // Apply print-specific styles to .printable-area
    const originalPrintStyles = {
      position: printArea.style.position,
      top: printArea.style.top,
      left: printArea.style.left,
      width: printArea.style.width
    };

    printArea.style.position = 'absolute';
    printArea.style.top = '0';
    printArea.style.left = '0';
    printArea.style.width = '100%';

    // Ensure .printable-area and its children are visible
    printArea.style.visibility = 'visible';
    Array.from(printArea.querySelectorAll('*')).forEach(child => {
      child.style.visibility = 'visible';
    });

    return { originalStyles, originalPrintStyles };
  };

  const revertPrintStyles = ({ originalStyles, originalPrintStyles }) => {
    // Revert visibility of body children
    originalStyles.forEach((visibility, element) => {
      element.style.visibility = visibility || '';
    });

    // Revert .printable-area styles
    const printArea = printRef.current;
    printArea.style.position = originalPrintStyles.position || '';
    printArea.style.top = originalPrintStyles.top || '';
    printArea.style.left = originalPrintStyles.left || '';
    printArea.style.width = originalPrintStyles.width || '';
  };

  const generateReceipt = async (receipt, actionType) => {
    if (!selectedSaleGroup) {
      toast.error('No sale group selected.');
      console.log('Error: No sale group selected.');
      return;
    }

    const element = printRef.current;
    if (!element) {
      toast.error('Receipt content not found. Please try again.');
      console.log('Error: printRef.current is undefined. Ensure editing state is set.');
      return;
    }

    console.log('Generating receipt for action:', actionType);
    console.log('Receipt content element:', element);

    try {
      console.log('Applying print styles...');
      const styleState = applyPrintStyles();

      console.log('Starting html2canvas rendering...');
      const canvas = await html2canvas(element, { scale: 1, useCORS: true });
      console.log('Canvas created:', canvas);

      console.log('Reverting print styles...');
      revertPrintStyles(styleState);

      const imgData = canvas.toDataURL('image/jpeg', 0.8); // Use JPEG with 80% quality
      const { width, height } = canvas;
      console.log('Canvas dimensions:', { width, height });

      // Use A4 dimensions (595 x 842 points at 72 DPI)
      const pdfWidth = 595; // A4 width in points
      const pdfHeight = 842; // A4 height in points
      const aspectRatio = width / height;
      let newWidth = pdfWidth;
      let newHeight = pdfWidth / aspectRatio;

      // If the height exceeds A4 height, scale down
      if (newHeight > pdfHeight) {
        newHeight = pdfHeight;
        newWidth = pdfHeight * aspectRatio;
      }

      const pdf = new jsPDF({
        orientation: newWidth > newHeight ? 'landscape' : 'portrait',
        unit: 'pt',
        format: 'a4'
      });

      console.log('Adding image to PDF...');
      pdf.addImage(imgData, 'JPEG', 0, 0, newWidth, newHeight);
      const pdfBlob = pdf.output('blob');
      const file = new File([pdfBlob], `receipt-${receipt.receipt_id}.pdf`, { type: 'application/pdf' });

      console.log('PDF generated successfully.');

      if (actionType === 'print') {
        console.log('Triggering print action...');
        window.print();
      } else if (actionType === 'whatsapp') {
        console.log('Triggering WhatsApp share...');
        if (navigator.share) {
          await navigator.share({
            files: [file],
            title: `Receipt ${receipt.receipt_id}`,
            text: `Here is your receipt from ${store?.shop_name || 'Store'}.`
          });
          toast.success('Receipt shared via WhatsApp!');
          console.log('WhatsApp share successful.');
        } else {
          const url = URL.createObjectURL(pdfBlob);
          const message = encodeURIComponent(`Here is your receipt from ${store?.shop_name || 'Store'}: ${url}`);
          window.open(`https://api.whatsapp.com/send?text=${message}`, '_blank');
          setTimeout(() => URL.revokeObjectURL(url), 10000);
          toast.success('Opened WhatsApp for sharing!');
          console.log('WhatsApp URL opened for sharing.');
        }
      } else if (actionType === 'download') {
        console.log('Triggering download action...');
        pdf.save(`receipt-${receipt.receipt_id}.pdf`);
        toast.success('Receipt downloaded successfully!');
        console.log('PDF download successful.');
      }
    } catch (error) {
      toast.error('Failed to generate receipt. Check console for details.');
      console.error('Generate receipt error:', error);
    }
  };

  const handleGenerateReceipt = (receipt) => {
    // Set editing state to ensure printRef content is rendered
    openEdit(receipt);
    // Delay setting action to ensure editing state is applied
    setTimeout(() => {
      setAction(receipt);
      console.log('Generate receipt button clicked, editing set:', receipt);
    }, 100);
  };

  const handleActionSelect = (receipt, selectedAction) => {
    console.log('Action selected:', selectedAction);
    setAction(null);
    generateReceipt(receipt, selectedAction);
  };

  const filteredSaleGroups = [...saleGroupsList]
    .filter(sg =>
      sg.id.toString().includes(salesSearch) ||
      sg.total_amount.toString().includes(salesSearch) ||
      sg.payment_method.toLowerCase().includes(salesSearch.toLowerCase())
    )
    .sort((a, b) => {
      const valA = a[sortKey];
      const valB = b[sortKey];
      if (sortOrder === 'asc') return valA > valB ? 1 : -1;
      return valA < valB ? 1 : -1;
    });

  useEffect(() => {
    setCurrentSaleGroupsPage(1);
    setCurrentPage(1);
  }, [filteredSaleGroups]);

  const totalSaleGroupsPages = Math.ceil(filteredSaleGroups.length / saleGroupsPerPage);
  const saleGroupsStartIndex = (currentSaleGroupsPage - 1) * saleGroupsPerPage;
  const saleGroupsEndIndex = saleGroupsStartIndex + saleGroupsPerPage;
  const paginatedSaleGroups = filteredSaleGroups.slice(saleGroupsStartIndex, saleGroupsEndIndex);

  const handleSaleGroupsPageChange = (page) => {
    if (page >= 1 && page <= totalSaleGroupsPages) {
      setCurrentSaleGroupsPage(page);
      if (saleGroupsRef.current && showSaleGroups) {
        saleGroupsRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }
  };

  const totalPages = Math.ceil(filteredReceipts.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedReceipts = filteredReceipts.slice(startIndex, endIndex);

  const handlePageChange = (page) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
      if (receiptsRef.current && showReceipts) {
        receiptsRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }
  };

  if (!storeId) return <div className="p-4 text-center text-red-500">Select a store first.</div>;

  const printStyles = `
    @media print {
      body * { visibility: hidden; }
      .printable-area, .printable-area * { visibility: visible; }
      .printable-area { position: absolute; top:0; left:0; width:100%; }
      .printable-area table { page-break-inside: auto; }
      .printable-area tr { page-break-inside: avoid; page-break-after: auto; }
    }
  `;
  const headerStyle = { backgroundColor: headerBgColor, color: headerTextColor };
  const watermarkStyle = { color: watermarkColor, fontSize: '4rem', opacity: 0.1 };

 const getProductGroups = () => {
  if (!selectedSaleGroup || !selectedSaleGroup.dynamic_sales) return [];

  const productMap = new Map();
  selectedSaleGroup.dynamic_sales.forEach(sale => {
    const product = sale.dynamic_product;
    const soldDeviceIds = sale.device_id?.split(',').filter(id => id.trim()) || [];
    const quantity = sale.quantity; // Use sale.quantity directly
    const unitPrice = sale.amount / sale.quantity;
    const totalAmount = unitPrice * quantity;

    if (!productMap.has(product.id)) {
      productMap.set(product.id, {
        productId: product.id,
        productName: product.name,
        deviceIds: soldDeviceIds,
        quantity,
        unitPrice,
        totalAmount,
        sellingPrice: product.selling_price || unitPrice
      });
    } else {
      const existing = productMap.get(product.id);
      existing.deviceIds = [...new Set([...existing.deviceIds, ...soldDeviceIds])];
      existing.quantity += quantity; // Aggregate quantity
      existing.totalAmount = existing.unitPrice * existing.quantity;
    }
  });

  return Array.from(productMap.values());
};



  const productGroups = getProductGroups();
  const totalQuantity = productGroups.reduce((sum, group) => sum + group.quantity, 0);
  const totalAmount = productGroups.reduce((sum, group) => sum + group.totalAmount, 0);

  return (
    <>
      <style>{printStyles}</style>
      <ToastContainer position="top-right" autoClose={3000} />
      <div className="print:hidden p-0 space-y-8 dark:bg-gray-900 dark:text-white">
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Receipt List</h2>
            <button
              onClick={() => setShowSaleGroups(!showSaleGroups)}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              {showSaleGroups ? 'Hide Receipt List' : 'Show Receipt List'}
            </button>
          </div>
          <div className="mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <input
                type="text"
                value={salesSearch}
                onChange={e => setSalesSearch(e.target.value)}
                placeholder="Search by Sale Group ID, Amount, or Payment Method"
                className="flex-1 border border-gray-300 dark:border-gray-600 px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-800 dark:text-white sales-search"
              />
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  onClick={() => {
                    setSortKey('id');
                    setSortOrder(o => (o === 'asc' ? 'desc' : 'asc'));
                  }}
                  className="border border-gray-300 dark:border-gray-600 px-4 py-2 rounded-lg hover:bg-indigo-50 dark:hover:bg-gray-700 transition-colors sort-id dark:bg-gray-800 dark:text-white"
                >
                  Sort by ID {sortKey === 'id' && (sortOrder === 'asc' ? '⬆️' : '⬇️')}
                </button>
                <button
                  onClick={() => {
                    setSortKey('total_amount');
                    setSortOrder(o => (o === 'asc' ? 'desc' : 'asc'));
                  }}
                  className="border border-gray-300 dark:border-gray-600 px-4 py-2 rounded-lg hover:bg-indigo-50 dark:hover:bg-gray-700 transition-colors dark:bg-gray-800 dark:text-white"
                >
                  Sort by Amount {sortKey === 'total_amount' && (sortOrder === 'asc' ? '⬆️' : '⬇️')}
                </button>
              </div>
            </div>
          </div>
          <AnimatePresence>
            {showSaleGroups && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="overflow-hidden"
              >
                <div ref={saleGroupsRef} className="overflow-x-auto rounded-lg shadow">
                  <table className="min-w-full text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                    <thead className="bg-gray-100 dark:bg-gray-700">
                      <tr>
                        <th className="text-left px-6 py-3 font-semibold text-gray-700 dark:text-gray-200 border-b border-gray-200 dark:border-gray-600">Sale Group ID</th>
                        <th className="text-left px-6 py-3 font-semibold text-gray-700 dark:text-gray-200 border-b border-gray-200 dark:border-gray-600">Total Amount</th>
                        <th className="text-left px-6 py-3 font-semibold text-gray-700 dark:text-gray-200 border-b border-gray-200 dark:border-gray-600">Payment Method</th>
                        <th className="text-left px-6 py-3 font-semibold text-gray-700 dark:text-gray-200 border-b border-gray-200 dark:border-gray-600">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedSaleGroups.map(sg => (
                        <tr
                          key={sg.id}
                          onClick={() => setSelectedSaleGroup(sg)}
                          className={`cursor-pointer transition-colors ${
                            selectedSaleGroup?.id === sg.id ? 'bg-indigo-50 dark:bg-gray-600' : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                          } even:bg-gray-50 dark:even:bg-gray-800`}
                        >
                          <td className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">#{sg.id}</td>
                          <td className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">₦{sg.total_amount.toFixed(2)}</td>
                          <td className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">{sg.payment_method}</td>
                          <td className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">{new Date(sg.created_at).toLocaleString()}</td>
                        </tr>
                      ))}
                      {paginatedSaleGroups.length === 0 && (
                        <tr>
                          <td colSpan="4" className="text-center text-gray-500 dark:text-gray-400 py-6">
                            No sale groups found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {filteredSaleGroups.length > saleGroupsPerPage && (
                  <div className="flex items-center justify-between mt-4">
                    <button
                      onClick={() => handleSaleGroupsPageChange(currentSaleGroupsPage - 1)}
                      disabled={currentSaleGroupsPage === 1}
                      className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                    >
                      Previous
                    </button>
                    <div className="flex gap-2">
                      {Array.from({ length: totalSaleGroupsPages }, (_, i) => i + 1).map(page => (
                        <button
                          key={page}
                          onClick={() => handleSaleGroupsPageChange(page)}
                          className={`px-3 py-1 rounded-lg ${
                            currentSaleGroupsPage === page
                              ? 'bg-indigo-600 text-white'
                              : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
                          }`}
                        >
                          {page}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => handleSaleGroupsPageChange(currentSaleGroupsPage + 1)}
                      disabled={currentSaleGroupsPage === totalSaleGroupsPages}
                      className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                    >
                      Next
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div ref={receiptsRef} className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold text-gray-800 dark:text-white">
              Receipts {selectedSaleGroup ? `for Sale Group #${selectedSaleGroup.id}` : ''}
            </h3>
            <button
              onClick={() => setShowReceipts(!showReceipts)}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              {showReceipts ? 'Hide Receipts' : 'Show Receipts'}
            </button>
          </div>
          <AnimatePresence>
            {showReceipts && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="overflow-hidden"
              >
                <div className="overflow-x-auto rounded-lg shadow">
                  <table className="min-w-full text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                    <thead className="bg-gray-100 dark:bg-gray-700">
                      <tr>
                        <th className="text-left px-6 py-3 font-semibold text-gray-700 dark:text-gray-200 border-b border-gray-200 dark:border-gray-600">Receipt ID</th>
                        <th className="text-left px-6 py-3 font-semibold text-gray-700 dark:text-gray-200 border-b border-gray-200 dark:border-gray-600">Customer</th>
                        <th className="text-left px-6 py-3 font-semibold text-gray-700 dark:text-gray-200 border-b border-gray-200 dark:border-gray-600">Phone</th>
                        <th className="text-left px-6 py-3 font-semibold text-gray-700 dark:text-gray-200 border-b border-gray-200 dark:border-gray-600">Warranty</th>
                        <th className="text-left px-6 py-3 font-semibold text-gray-700 dark:text-gray-200 border-b border-gray-200 dark:border-gray-600">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedReceipts.map((r, index) => (
                        <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 even:bg-gray-50 dark:even:bg-gray-800 transition-colors">
                          <td className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 truncate">{r.receipt_id}</td>
                          <td className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 truncate">{r.customer_name || '-'}</td>
                          <td className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 truncate">{r.phone_number || '-'}</td>
                          <td className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 truncate">{r.warranty || '-'}</td>
                          <td className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                            <div className="flex gap-4">
                              <button onClick={() => openEdit(r)} className={`text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 edit-receipt-${index}`}>
                                <FaEdit />
                              </button>
                              <button
                                onClick={async () => {
                                  await supabase.from("receipts").delete().eq("id", r.id);
                                  const { data } = await supabase
                                    .from("receipts")
                                    .select("*")
                                    .eq("sale_group_id", selectedSaleGroup.id);
                                  setReceipts(data);
                                }}
                                className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                              >
                                <FaTrashAlt />
                              </button>
                              <button
                                onClick={() => handleGenerateReceipt(r)}
                                className={`text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300 generate-receipt-${index}`}
                              >
                                <FaPrint />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {paginatedReceipts.length === 0 && (
                        <tr>
                          <td colSpan="5" className="text-center text-gray-500 dark:text-gray-400 py-6">
                            No receipts found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {filteredReceipts.length > itemsPerPage && (
                  <div className="flex items-center justify-between mt-4">
                    <button
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                      className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                    >
                      Previous
                    </button>
                    <div className="flex gap-2">
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                        <button
                          key={page}
                          onClick={() => handlePageChange(page)}
                          className={`px-3 py-1 rounded-lg ${
                            currentPage === page
                              ? 'bg-indigo-600 text-white'
                              : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                          }`}
                        >
                          {page}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-300 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                    >
                      Next
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      {editing && (
        <div className="print:hidden fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center p-4 z-50 overflow-auto mt-10">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-8 space-y-6">
            <h2 className="text-2xl font-bold text-center text-gray-800 dark:text-white">Edit Receipt {editing.receipt_id}</h2>
            <div className="space-y-4">
              {['customer_name', 'customer_address', 'phone_number', 'warranty'].map(field => (
                <label key={field} className="block">
                  <span className="font-semibold text-gray-700 dark:text-gray-200 capitalize block mb-1">
                    {field.replace('_', ' ')}
                  </span>
                  <input
                    name={field}
                    value={form[field]}
                    onChange={handleChange}
                    className="border border-gray-300 dark:border-gray-600 px-4 py-2 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-900 dark:text-white"
                  />
                </label>
              ))}
            </div>
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-4">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white">Customize Receipt Style</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-gray-700 dark:text-gray-200 mb-1">Header Background</label>
                  <input
                    type="color"
                    value={headerBgColor}
                    onChange={e => setHeaderBgColor(e.target.value)}
                    className="w-full h-10 p-0 border border-gray-300 dark:border-gray-600 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-gray-700 dark:text-gray-200 mb-1">Header Text Color</label>
                  <input
                    type="color"
                    value={headerTextColor}
                    onChange={e => setHeaderTextColor(e.target.value)}
                    className="w-full h-10 p-0 border border-gray-300 dark:border-gray-600 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-gray-700 dark:text-gray-200 mb-1">Header Font</label>
                  <select
                    value={headerFont}
                    onChange={e => setHeaderFont(e.target.value)}
                    className="border border-gray-300 dark:border-gray-600 px-4 py-2 rounded-lg w-full dark:bg-gray-900 dark:text-white"
                  >
                    <option value="font-sans">Sans</option>
                    <option value="font-serif">Serif</option>
                    <option value="font-mono">Mono</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-gray-700 dark:text-gray-200 mb-1">Body Font</label>
                  <select
                    value={bodyFont}
                    onChange={e => setBodyFont(e.target.value)}
                    className="border border-gray-300 dark:border-gray-600 px-4 py-2 rounded-lg w-full dark:bg-gray-900 dark:text-white"
                  >
                    <option value="font-sans">Sans</option>
                    <option value="font-serif">Serif</option>
                    <option value="font-mono">Mono</option>
                  </select>
                </div>
                <div className="sm:flex sm:items-center sm:gap-4">
                  <div className="sm:col-span-2">
                    <label className="block font-semibold text-gray-700 dark:text-gray-200 mb-1">Watermark Color</label>
                    <input
                      type="color"
                      value={watermarkColor}
                      onChange={e => setWatermarkColor(e.target.value)}
                      className="w-full h-10 p-0 border border-gray-300 dark:border-gray-600 rounded"
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-6 p-4 rounded-lg" style={headerStyle}>
              <h3 className={`${headerFont} text-lg font-semibold`}>{store?.name}</h3>
              <p className={`${headerFont} text-sm text-gray-600 dark:text-gray-400`}>{store?.address}</p>
              <p className={`${headerFont} text-sm text-gray-400 dark:text-gray-600`}>Phone: {store?.phone}</p>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setEditing(null)} className="px-4 py-2 bg-gray-200 dark:bg-gray-800 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-700">Cancel</button>
              <button onClick={saveReceipt} className="px-4 py-2 bg-blue-600 rounded-lg hover:bg-blue-700 flex items-center justify-between gap-2">
                <FaDownload /> Save Receipt
              </button>
            </div>
          </div>
        </div>
      )}
      {action && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-4">Select Action</h2>
            <div className="space-y-4">
              <button
                onClick={() => handleActionSelect(action, 'print')}
                className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center justify-center gap-2"
              >
                <FaPrint /> Print
              </button>
              <button
                onClick={() => handleActionSelect(action, 'whatsapp')}
                className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center justify-center gap-2"
              >
                <FaWhatsapp /> Share via WhatsApp
              </button>
              <button
                onClick={() => handleActionSelect(action, 'download')}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2"
              >
                <FaDownload /> Download
              </button>
            </div>
            <button
              onClick={() => setAction(null)}
              className="mt-4 w-full px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {editing && selectedSaleGroup && (
        <div ref={printRef} className="printable-area relative bg-white p-6 mt-6 shadow-lg rounded-lg overflow-x-auto">
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={watermarkStyle}>
            <span className={`${bodyFont}`}>{store?.shop_name || '-'}</span>
          </div>
          <div className={`p-4 rounded-t ${headerFont}`} style={headerStyle}>
            <h1 className="text-2xl font-bold">{store?.shop_name || '-'}</h1>
            <p className="text-sm">{store?.business_address || '-'}</p>
            <p className="text-sm">Phone: {store?.phone_number || '-'}</p>
          </div>
          <table className={`w-full rounded-t border-none mb-4 mt-4 ${bodyFont}`}>
            <thead>
              <tr>
                <th className="border px-4 py-2 text-left w-1/4">Product</th>
                <th className="border px-4 py-2 text-left w-1/4">Device ID</th>
                <th className="border px-4 py-2 text-left w-1/6">Quantity</th>
                <th className="border px-4 py-2 text-left w-1/6">Unit Price</th>
                <th className="border px-4 py-2 text-left w-1/6">Amount</th>
              </tr>
            </thead>
            <tbody>
              {productGroups.map((group, index) => (
                <React.Fragment key={group.productId}>
                  <tr className="bg-blue-50 dark:bg-gray-800">
                    <td className="border-b px-4 py-2 font-bold" colSpan="2">{group.productName}</td>
                    <td className="border-b px-2 py-2">{group.quantity}</td>
                    <td className="border-b px-4 py-2">₦{group.unitPrice.toFixed(2)}</td>
                    <td className="border-b px-4 py-2">₦{group.totalAmount.toFixed(2)}</td>
                  </tr>
                  {group.deviceIds.map((deviceId, idx) => (
                    <tr key={`${group.productId}-${idx}`}>
                      <td className="border-b px-4 py-2"></td>
                      <td className="border-b px-4 py-2 pl-6">{deviceId}</td>
                      <td className="border-b px-4 py-2"></td>
                      <td className="border-b px-4 py-2"></td>
                      <td className="border-b px-4 py-2"></td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan="2" className="border px-4 py-2 text-right font-bold">Total:</td>
                <td className="border px-4 py-2">{totalQuantity}</td>
                <td className="border px-4 py-2"></td>
                <td className="border px-4 py-2 font-bold">₦{totalAmount.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
          <div className="mt-4 space-y-2">
            <p><strong>Receipt ID:</strong> {editing.receipt_id}</p>
            <p><strong>Date:</strong> {new Date(selectedSaleGroup.created_at).toLocaleString()}</p>
            <p><strong>Payment Method:</strong> {selectedSaleGroup.payment_method}</p>
            <p><strong>Customer Name:</strong> {editing.customer_name || '-'}</p>
            <p><strong>Address:</strong> {editing.customer_address || '-'}</p>
            <p><strong>Phone:</strong> {editing.phone_number || '-'}</p>
            <p><strong>Warranty:</strong> {editing.warranty || '-'}</p>
          </div>
          <div className="grid grid-cols-2 gap-8 p-4 mt-4">
            <div className="border-t text-center pt-2">Manager Signature</div>
            <div className="border-t text-center pt-2">Customer Signature</div>
          </div>
        </div>
      )}
      {showOnboarding && onboardingStep < onboardingSteps.length && (
        <motion.div
          className="fixed z-50 bg-blue-600 dark:bg-gray-900 border rounded-lg shadow-lg p-4 max-w-xs"
          style={getTooltipPosition(onboardingSteps[onboardingStep].target)}
          variants={tooltipVariants}
          initial="hidden"
          animate="visible"
        >
          <p className="text-sm text-gray-200 dark:text-gray-300 mb-2">
            {onboardingSteps[onboardingStep].content}
          </p>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-200">
              Step {onboardingStep + 1} of {onboardingSteps.length}
            </span>
            <div className="space-x-2">
              <button
                onClick={handleSkipOnboarding}
                className="text-sm text-gray-300 hover:text-gray-800 dark:text-gray-300"
              >
                Skip
              </button>
              <button
                onClick={handleNextStep}
                className="bg-blue-600 hover:bg-blue-700 text-white py-1 px-3 rounded"
              >
                {onboardingStep + 1 === onboardingSteps.length ? 'Finish' : 'Next'}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </>
  );
}