import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { supabase } from "../../supabaseClient";
import {  FaPlus, FaBell, FaCamera } from 'react-icons/fa';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { Html5Qrcode, Html5QrcodeSupportedFormats, Html5QrcodeScannerState } from 'html5-qrcode';
import DeviceDebtRepayment from './DeviceDebtRepayment';

export default function DebtsManager() {
  const storeId = localStorage.getItem("store_id");
  const [, setStore] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [debts, setDebts] = useState([]);
  const [filteredDebts, setFilteredDebts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [editing, setEditing] = useState(null);
  const [debtEntries, setDebtEntries] = useState([
    {
      customer_id: "",
      customer_name: "",
      phone_number: "",
      dynamic_product_id: "",
      product_name: "",
      supplier: "",
      deviceIds: [""],
      deviceSizes: [""],
      qty: "",
      owed: "",
      deposited: "",
      date: ""
    }
  ]);
  const [error, setError] = useState(null);
  const [showReminderForm, setShowReminderForm] = useState(false);
  const [reminderType, setReminderType] = useState('one-time');
  const [reminderTime, setReminderTime] = useState('');
  const [showDetail, setShowDetail] = useState(null);
  const [soldDeviceIds, setSoldDeviceIds] = useState([]);
  const [isLoadingSoldStatus, setIsLoadingSoldStatus] = useState(false);
  const [detailPage, setDetailPage] = useState(1);
  const detailPageSize = 20;
  const debtsRef = useRef();
  const reminderIntervalRef = useRef(null);
  const [showScanner, setShowScanner] = useState(false);
  const [scannerTarget, setScannerTarget] = useState(null); // { modal: 'add'|'edit', entryIndex: number, deviceIndex: number }
  const [scannerError, setScannerError] = useState(null);
  const [scannerLoading, setScannerLoading] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [externalScannerMode, setExternalScannerMode] = useState(false);
  const [scannerBuffer, setScannerBuffer] = useState('');
  const [lastKeyTime, setLastKeyTime] = useState(0);
  const videoRef = useRef(null);
  const scannerDivRef = useRef(null);
  const html5QrCodeRef = useRef(null);
  const manualInputRef = useRef(null);

  // Fetch store details
  useEffect(() => {
    if (!storeId) {
      setError("Store ID is missing. Please log in or select a store.");
      toast.error("Store ID is missing.");
      return;
    }
    supabase
      .from("stores")
      .select("shop_name,business_address,phone_number")
      .eq("id", storeId)
      .single()
      .then(({ data, error }) => {
        if (error) {
          setError("Failed to fetch store details: " + error.message);
          toast.error("Failed to fetch store details.");
        } else {
          setStore(data);
        }
      });
  }, [storeId]);

  // Fetch customers
  useEffect(() => {
    if (!storeId) return;
    supabase
      .from('customer')
      .select('id, fullname, phone_number')
      .eq('store_id', storeId)
      .then(({ data, error }) => {
        if (error) {
          setError("Failed to fetch customers: " + error.message);
          toast.error("Failed to fetch customers.");
        } else {
          setCustomers(data || []);
        }
      });
  }, [storeId]);

  // Fetch products
  useEffect(() => {
    if (!storeId) return;
    supabase
      .from('dynamic_product')
      .select('id, name')
      .eq('store_id', storeId)
      .then(({ data, error }) => {
        if (error) {
          setError("Failed to fetch products: " + error.message);
          toast.error("Failed to fetch products.");
        } else {
          setProducts(data || []);
        }
      });
  }, [storeId]);

  // Fetch debts
  const fetchDebts = useCallback(async () => {
    if (!storeId) return;
    const { data, error } = await supabase
      .from('debts')
      .select('*')
      .eq('store_id', storeId);
    if (error) {
      setError("Failed to fetch debts: " + error.message);
      toast.error("Failed to fetch debts.");
    } else {
      const debtsWithIds = data.map(debt => ({
        ...debt,
        deviceIds: debt.device_id ? debt.device_id.split(',').filter(Boolean) : [],
        deviceSizes: debt.device_sizes ? debt.device_sizes.split(',').filter(Boolean) : [],
      }));
      setDebts(debtsWithIds);
      setFilteredDebts(debtsWithIds);
    }
  }, [storeId]);

  useEffect(() => {
    fetchDebts();
  }, [fetchDebts]);

  // Filter debts
  useEffect(() => {
    const term = searchTerm.toLowerCase();
    setFilteredDebts(
      debts.filter(d => {
        const fields = [
          d.customer_name,
          d.product_name,
          d.phone_number,
          d.supplier,
          ...d.deviceIds,
          ...d.deviceSizes,
          String(d.qty),
          d.owed != null ? `₦${d.owed.toFixed(2)}` : '',
          d.deposited != null ? `₦${d.deposited.toFixed(2)}` : '',
          d.remaining_balance != null ? `₦${d.remaining_balance.toFixed(2)}` : '',
          d.date
        ];
        return fields.some(f => f?.toString().toLowerCase().includes(term));
      })
    );
  }, [searchTerm, debts]);

  // Scroll debts into view
  useEffect(() => {
    if (debtsRef.current) {
      debtsRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [debts]);

  // Check sold devices
  const checkSoldDevices = useCallback(async (deviceIds) => {
    if (!deviceIds || deviceIds.length === 0) return [];
    setIsLoadingSoldStatus(true);
    try {
      const normalizedIds = deviceIds.map(id => id.trim());
      const { data, error } = await supabase
        .from('dynamic_sales')
        .select('device_id')
        .in('device_id', normalizedIds);
      if (error) throw error;
      const soldIds = data.map(item => item.device_id.trim());
      setSoldDeviceIds(soldIds);
      return soldIds;
    } catch (error) {
      console.error('Error fetching sold devices:', error);
      return [];
    } finally {
      setIsLoadingSoldStatus(false);
    }
  }, []);

  useEffect(() => {
    if (showDetail && showDetail.deviceIds.length > 0) {
      checkSoldDevices(showDetail.deviceIds);
    } else {
      setSoldDeviceIds([]);
    }
  }, [showDetail, checkSoldDevices]);

  // Pagination for device IDs modal
  const filteredDevices = useMemo(() => {
    if (!showDetail) return [];
    return showDetail.deviceIds.map((id, i) => ({
      id,
      size: showDetail.deviceSizes[i] || '-'
    }));
  }, [showDetail]);

  const totalDetailPages = Math.ceil(filteredDevices.length / detailPageSize);

  const paginatedDevices = useMemo(() => {
    const start = (detailPage - 1) * detailPageSize;
    const end = start + detailPageSize;
    return filteredDevices.slice(start, end);
  }, [filteredDevices, detailPage]);

  // Process scanned barcode
  const processScannedBarcode = useCallback((scannedCode) => {
    const trimmedCode = scannedCode.trim();
    if (!trimmedCode) {
      toast.error('Invalid barcode: Empty value');
      setScannerError('Invalid barcode: Empty value');
      return false;
    }

    if (scannerTarget) {
      const { modal, entryIndex, deviceIndex } = scannerTarget;
      let newDeviceIndex;

      if (modal === 'add') {
        const entries = [...debtEntries];
        if (entries[entryIndex].deviceIds.some((id) => id.trim().toLowerCase() === trimmedCode.toLowerCase())) {
          toast.error(`Barcode "${trimmedCode}" already exists in this debt`);
          setScannerError(`Barcode "${trimmedCode}" already exists`);
          return false;
        }
        entries[entryIndex].deviceIds[deviceIndex] = trimmedCode;
        entries[entryIndex].deviceSizes[deviceIndex] = entries[entryIndex].deviceSizes[deviceIndex] || '';
        entries[entryIndex].deviceIds.push('');
        entries[entryIndex].deviceSizes.push('');
        setDebtEntries(entries);
        newDeviceIndex = entries[entryIndex].deviceIds.length - 1;
      } else if (modal === 'edit') {
        if (editing.deviceIds.some((id) => id.trim().toLowerCase() === trimmedCode.toLowerCase())) {
          toast.error(`Barcode "${trimmedCode}" already exists in this debt`);
          setScannerError(`Barcode "${trimmedCode}" already exists`);
          return false;
        }
        const newDeviceIds = [...editing.deviceIds];
        const newDeviceSizes = [...editing.deviceSizes];
        newDeviceIds[deviceIndex] = trimmedCode;
        newDeviceSizes[deviceIndex] = newDeviceSizes[deviceIndex] || '';
        newDeviceIds.push('');
        newDeviceSizes.push('');
        setEditing(prev => ({ ...prev, deviceIds: newDeviceIds, deviceSizes: newDeviceSizes }));
        newDeviceIndex = newDeviceIds.length - 1;
      }

      setScannerTarget({
        modal,
        entryIndex,
        deviceIndex: newDeviceIndex,
      });
      setScannerError(null);
      toast.success(`Scanned barcode: ${trimmedCode}`);
      return true;
    }
    return false;
  }, [scannerTarget, debtEntries, editing]);

  // External scanner input
  useEffect(() => {
    if (!externalScannerMode || !scannerTarget || !showScanner) return;

    const handleKeypress = (e) => {
      const currentTime = Date.now();
      const timeDiff = currentTime - lastKeyTime;

      if (timeDiff > 50 && scannerBuffer) {
        setScannerBuffer('');
      }

      if (e.key === 'Enter' && scannerBuffer) {
        const success = processScannedBarcode(scannerBuffer);
        if (success) {
          setScannerBuffer('');
          setManualInput('');
          if (manualInputRef.current) {
            manualInputRef.current.focus();
          }
        }
      } else if (e.key !== 'Enter') {
        setScannerBuffer(prev => prev + e.key);
      }

      setLastKeyTime(currentTime);
    };

    document.addEventListener('keypress', handleKeypress);

    return () => {
      document.removeEventListener('keypress', handleKeypress);
    };
  }, [externalScannerMode, scannerTarget, scannerBuffer, lastKeyTime, showScanner, processScannedBarcode]);

  // Webcam scanner
  useEffect(() => {
    if (!showScanner || !scannerDivRef.current || !videoRef.current || externalScannerMode) return;

    setScannerLoading(true);
    const videoElement = videoRef.current;

    try {
      if (!document.getElementById('scanner')) {
        setScannerError('Scanner container not found. Please use manual input.');
        setScannerLoading(false);
        toast.error('Scanner container not found. Please use manual input.');
        return;
      }

      html5QrCodeRef.current = new Html5Qrcode('scanner');
    } catch (err) {
      setScannerError(`Failed to initialize scanner: ${err.message}`);
      setScannerLoading(false);
      toast.error('Failed to initialize scanner. Please use manual input.');
      return;
    }

    const config = {
      fps: 15,
      qrbox: { width: 250, height: 100 },
      formatsToSupport: [
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.QR_CODE,
        Html5QrcodeSupportedFormats.DATA_MATRIX,
      ],
      aspectRatio: 4 / 3,
      disableFlip: true,
      videoConstraints: {
        facingMode: 'environment',
        width: { ideal: 640 },
        height: { ideal: 480 },
      },
    };

    const onScanSuccess = (decodedText) => {
      const success = processScannedBarcode(decodedText);
      if (success) {
        setManualInput('');
        if (manualInputRef.current) {
          manualInputRef.current.focus();
        }
      }
    };

    const onScanFailure = (error) => {
      if (
        error.includes('No MultiFormat Readers were able to detect the code') ||
        error.includes('No QR code found') ||
        error.includes('IndexSizeError')
      ) {
        console.debug('No barcode detected');
      } else {
        setScannerError(`Scan error: ${error}`);
      }
    };

    const startScanner = async (attempt = 1, maxAttempts = 5) => {
      if (!videoElement || !scannerDivRef.current) {
        setScannerError('Scanner elements not found');
        setScannerLoading(false);
        toast.error('Scanner elements not found. Please use manual input.');
        return;
      }
      if (attempt > maxAttempts) {
        setScannerError('Failed to initialize scanner after multiple attempts');
        setScannerLoading(false);
        toast.error('Failed to initialize scanner. Please use manual input.');
        return;
      }
      try {
        let stream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: config.videoConstraints,
          });
        } catch (err) {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 640 }, height: { ideal: 480 } },
          });
        }
        videoElement.srcObject = stream;
        await new Promise(resolve => {
          videoElement.onloadedmetadata = () => resolve();
        });
        await html5QrCodeRef.current.start(
          config.videoConstraints,
          config,
          onScanSuccess,
          onScanFailure
        );
        setScannerLoading(false);
      } catch (err) {
        setScannerError(`Failed to initialize scanner: ${err.message}`);
        setScannerLoading(false);
        if (err.name === 'NotAllowedError') {
          toast.error('Camera access denied. Please allow camera permissions.');
        } else if (err.name === 'NotFoundError') {
          toast.error('No camera found. Please use manual input.');
        } else if (err.name === 'OverconstrainedError') {
          setTimeout(() => startScanner(attempt + 1, maxAttempts), 200);
        } else {
          toast.error('Failed to start camera. Please use manual input.');
        }
      }
    };

    Html5Qrcode.getCameras()
      .then(cameras => {
        if (cameras.length === 0) {
          setScannerError('No cameras detected. Please use manual input.');
          setScannerLoading(false);
          toast.error('No cameras detected. Please use manual input.');
          return;
        }
        startScanner();
      })
      .catch(err => {
        setScannerError(`Failed to access cameras: ${err.message}`);
        setScannerLoading(false);
        toast.error('Failed to access cameras. Please use manual input.');
      });

    return () => {
      if (html5QrCodeRef.current &&
          [Html5QrcodeScannerState.SCANNING, Html5QrcodeScannerState.PAUSED].includes(
            html5QrCodeRef.current.getState()
          )) {
        html5QrCodeRef.current
          .stop()
          .then(() => console.log('Webcam scanner stopped'))
          .catch(err => console.error('Error stopping scanner:', err));
      }
      if (videoElement && videoElement.srcObject) {
        videoElement.srcObject.getTracks().forEach(track => track.stop());
        videoElement.srcObject = null;
      }
      html5QrCodeRef.current = null;
    };
  }, [showScanner, scannerTarget, externalScannerMode, processScannedBarcode]);

  // Stop scanner
  const stopScanner = useCallback(() => {
    if (html5QrCodeRef.current &&
        [Html5QrcodeScannerState.SCANNING, Html5QrcodeScannerState.PAUSED].includes(
          html5QrCodeRef.current.getState()
        )) {
      html5QrCodeRef.current
        .stop()
        .then(() => console.log('Scanner stopped'))
        .catch(err => console.error('Error stopping scanner:', err));
    }
    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    html5QrCodeRef.current = null;
  }, []);

  // Auto-focus manual input
  useEffect(() => {
    if (showScanner && manualInputRef.current) {
      manualInputRef.current.focus();
    }
  }, [showScanner, scannerTarget]);

  // Open scanner
  const openScanner = (modal, entryIndex, deviceIndex) => {
    setScannerTarget({ modal, entryIndex, deviceIndex });
    setShowScanner(true);
    setScannerError(null);
    setScannerLoading(true);
    setManualInput('');
    setExternalScannerMode(false);
    setScannerBuffer('');
  };

  // Handle manual input
  const handleManualInput = () => {
    const trimmedInput = manualInput.trim();
    const success = processScannedBarcode(trimmedInput);
    if (success) {
      setManualInput('');
      if (manualInputRef.current) {
        manualInputRef.current.focus();
      }
    }
  };

  // Handle Enter key for manual input
  const handleManualInputKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleManualInput();
    }
  };

  // Handle reminder notifications
  const showDebtReminders = () => {
    const unpaidDebts = debts.filter(d => (d.remaining_balance || 0) > 0);
    if (unpaidDebts.length === 0) {
      toast.info("No unpaid debts found.");
      return;
    }

    unpaidDebts.forEach(d => {
      toast.warn(
        <div>
          <p><strong>Debtor:</strong> {d.customer_name}</p>
          <p><strong>Outstanding:</strong> ₦{(d.remaining_balance || 0).toFixed(2)}</p>
          <p><strong>Product:</strong> {d.product_name}</p>
          <p><strong>Date:</strong> {d.date}</p>
        </div>,
        { autoClose: 5000 }
      );
    });
  };

  const scheduleReminders = () => {
    if (!reminderTime) {
      toast.error("Please select a reminder time.");
      return;
    }

    const now = new Date();
    const [hours, minutes] = reminderTime.split(':').map(Number);
    let nextReminder = new Date(now);
    nextReminder.setHours(hours, minutes, 0, 0);

    if (nextReminder <= now) {
      nextReminder.setDate(nextReminder.getDate() + 1);
    }

    const msUntilReminder = nextReminder - now;

    if (reminderIntervalRef.current) {
      clearInterval(reminderIntervalRef.current);
    }

    if (reminderType === 'one-time') {
      setTimeout(showDebtReminders, msUntilReminder);
      toast.success(`Reminder set for ${nextReminder.toLocaleString()}`);
    } else {
      setTimeout(() => {
        showDebtReminders();
        reminderIntervalRef.current = setInterval(
          showDebtReminders,
          reminderType === 'daily' ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000
        );
      }, msUntilReminder);
      toast.success(`Recurring ${reminderType} reminders set starting ${nextReminder.toLocaleString()}`);
    }

    setShowReminderForm(false);
  };

  // Handle debt entry changes
  const handleDebtChange = (index, e) => {
    const { name, value } = e.target;
    const updatedEntries = [...debtEntries];
    updatedEntries[index] = { ...updatedEntries[index], [name]: value };

    if (name === 'customer_id' && value) {
      const selectedCustomer = customers.find(c => c.id === parseInt(value));
      if (selectedCustomer) {
        updatedEntries[index] = {
          ...updatedEntries[index],
          customer_id: value,
          customer_name: selectedCustomer.fullname,
          phone_number: selectedCustomer.phone_number || ""
        };
      }
    }

    if (name === 'dynamic_product_id' && value) {
      const selectedProduct = products.find(p => p.id === parseInt(value));
      if (selectedProduct) {
        updatedEntries[index] = {
          ...updatedEntries[index],
          dynamic_product_id: value,
          product_name: selectedProduct.name
        };
      }
    }

    setDebtEntries(updatedEntries);
  };

  // Handle device ID and size changes
  const handleDeviceIdChange = (index, deviceIndex, value) => {
    const updatedEntries = [...debtEntries];
    updatedEntries[index].deviceIds[deviceIndex] = value;
    setDebtEntries(updatedEntries);
  };

  const handleDeviceSizeChange = (index, deviceIndex, value) => {
    const updatedEntries = [...debtEntries];
    updatedEntries[index].deviceSizes[deviceIndex] = value;
    setDebtEntries(updatedEntries);
  };

  const handleEditDeviceIdChange = (deviceIndex, value) => {
    setEditing(prev => ({
      ...prev,
      deviceIds: prev.deviceIds.map((id, i) => i === deviceIndex ? value : id)
    }));
  };

  const handleEditDeviceSizeChange = (deviceIndex, value) => {
    setEditing(prev => ({
      ...prev,
      deviceSizes: prev.deviceSizes.map((size, i) => i === deviceIndex ? value : size)
    }));
  };

  const addDeviceIdField = index => {
    const updatedEntries = [...debtEntries];
    updatedEntries[index].deviceIds.push('');
    updatedEntries[index].deviceSizes.push('');
    setDebtEntries(updatedEntries);
  };

  const addEditDeviceIdField = () => {
    setEditing(prev => ({
      ...prev,
      deviceIds: [...prev.deviceIds, ''],
      deviceSizes: [...prev.deviceSizes, '']
    }));
  };

  const removeDeviceIdField = (index, deviceIndex) => {
    const updatedEntries = [...debtEntries];
    updatedEntries[index].deviceIds.splice(deviceIndex, 1);
    updatedEntries[index].deviceSizes.splice(deviceIndex, 1);
    if (updatedEntries[index].deviceIds.length === 0) {
      updatedEntries[index].deviceIds = [''];
      updatedEntries[index].deviceSizes = [''];
    }
    setDebtEntries(updatedEntries);
  };

  const removeEditDeviceIdField = (deviceIndex) => {
    setEditing(prev => {
      const newDeviceIds = [...prev.deviceIds];
      const newDeviceSizes = [...prev.deviceSizes];
      newDeviceIds.splice(deviceIndex, 1);
      newDeviceSizes.splice(deviceIndex, 1);
      if (newDeviceIds.length === 0) {
        newDeviceIds.push('');
        newDeviceSizes.push('');
      }
      return { ...prev, deviceIds: newDeviceIds, deviceSizes: newDeviceSizes };
    });
  };

  const addDebtEntry = () => {
    setDebtEntries([
      ...debtEntries,
      {
        customer_id: "",
        customer_name: "",
        phone_number: "",
        dynamic_product_id: "",
        product_name: "",
        supplier: "",
        deviceIds: [""],
        deviceSizes: [""],
        qty: "",
        owed: "",
        deposited: "",
        date: ""
      }
    ]);
  };

  const removeDebtEntry = index => {
    if (debtEntries.length === 1) return;
    setDebtEntries(debtEntries.filter((_, i) => i !== index));
  };

  const saveDebts = async () => {
  let hasError = false;

  // Validation for editing an existing debt
  if (editing && editing.id) {
    const entry = editing;
    if (
      !entry.customer_id ||
      isNaN(parseInt(entry.customer_id)) ||
      !entry.dynamic_product_id ||
      isNaN(parseInt(entry.dynamic_product_id)) ||
      !entry.qty ||
      isNaN(parseInt(entry.qty)) ||
      !entry.owed ||
      isNaN(parseFloat(entry.owed)) ||
      !entry.date ||
      entry.deviceIds.filter(id => id.trim()).length === 0
    ) {
      hasError = true;
    } else {
      const debtData = {
        store_id: parseInt(storeId),
        customer_id: parseInt(entry.customer_id),
        dynamic_product_id: parseInt(entry.dynamic_product_id),
        customer_name: entry.customer_name || null,
        product_name: entry.product_name || null,
        phone_number: entry.phone_number || null,
        supplier: entry.supplier || null,
        device_id: entry.deviceIds.filter(id => id.trim()).join(','),
        device_sizes: entry.deviceSizes
          .filter((_, i) => entry.deviceIds[i].trim())
          .join(','),
        qty: parseInt(entry.qty),
        owed: parseFloat(entry.owed),
        deposited: entry.deposited ? parseFloat(entry.deposited) : 0.00,
        remaining_balance:
          parseFloat(entry.owed) -
          (entry.deposited ? parseFloat(entry.deposited) : 0.00),
        date: entry.date,
      };

      try {
        await supabase.from('debts').update(debtData).eq('id', editing.id);
        setEditing(null);
        setDebtEntries([
          {
            customer_id: '',
            customer_name: '',
            phone_number: '',
            dynamic_product_id: '',
            product_name: '',
            supplier: '',
            deviceIds: [''],
            deviceSizes: [''],
            qty: '',
            owed: '',
            deposited: '',
            date: '',
          },
        ]);
        setError(null);
        toast.success('Debt updated successfully!');
        fetchDebts();
      } catch (err) {
        setError('Failed to update debt: ' + err.message);
        toast.error('Failed to update debt.');
      }
      return;
    }
  } else {
    // Validation for adding new debts
    const validEntries = debtEntries.filter(entry => {
      if (
        !entry.customer_id ||
        isNaN(parseInt(entry.customer_id)) ||
        !entry.dynamic_product_id ||
        isNaN(parseInt(entry.dynamic_product_id)) ||
        !entry.qty ||
        isNaN(parseInt(entry.qty)) ||
        !entry.owed ||
        isNaN(parseFloat(entry.owed)) ||
        !entry.date ||
        entry.deviceIds.filter(id => id.trim()).length === 0
      ) {
        hasError = true;
        return false;
      }
      return true;
    });

    if (hasError || validEntries.length === 0) {
      setError(
        'Please fill all required fields (Customer, Product, Device ID, Qty, Owed, Date) correctly.'
      );
      toast.error('Please fill all required fields correctly.');
      return;
    }

    const debtData = validEntries.map(entry => ({
      store_id: parseInt(storeId),
      customer_id: parseInt(entry.customer_id),
      dynamic_product_id: parseInt(entry.dynamic_product_id),
      customer_name: entry.customer_name || null,
      product_name: entry.product_name || null,
      phone_number: entry.phone_number || null,
      supplier: entry.supplier || null,
      device_id: entry.deviceIds.filter(id => id.trim()).join(','),
      device_sizes: entry.deviceSizes
        .filter((_, i) => entry.deviceIds[i].trim())
        .join(','),
      qty: parseInt(entry.qty),
      owed: parseFloat(entry.owed),
      deposited: entry.deposited ? parseFloat(entry.deposited) : 0.00,
      remaining_balance:
        parseFloat(entry.owed) -
        (entry.deposited ? parseFloat(entry.deposited) : 0.00),
      date: entry.date,
    }));

    try {
      await supabase.from('debts').insert(debtData);
      setEditing(null);
      setDebtEntries([
        {
          customer_id: '',
          customer_name: '',
          phone_number: '',
          dynamic_product_id: '',
          product_name: '',
          supplier: '',
          deviceIds: [''],
          deviceSizes: [''],
          qty: '',
          owed: '',
          deposited: '',
          date: '',
        },
      ]);
      setError(null);
      toast.success(`${debtData.length} debt(s) saved successfully!`);
      fetchDebts();
    } catch (err) {
      setError('Failed to save debts: ' + err.message);
      toast.error('Failed to save debts.');
    }
  }

  if (hasError) {
    setError(
      'Please fill all required fields (Customer, Product, Device ID, Qty, Owed, Date) correctly.'
    );
    toast.error('Please fill all required fields correctly.');
  }
};




  if (!storeId) {
    return <div className="p-4 text-center text-red-500">Store ID is missing. Please log in or select a store.</div>;
  }

  return (
    <div className="p-0 space-y-6 dark:bg-gray-900 dark:text-white">
      <DeviceDebtRepayment />
      <ToastContainer position="top-right" autoClose={3000} />

      {error && (
        <div className="p-4 mb-4 bg-red-100 text-red-700 rounded">
          {error}
        </div>
      )}

      <div>
        <h2 className="text-lg font-semibold mb-4">Debts</h2>

        <div className="w-full mb-4">
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search debts..."
            className="flex-1 border px-4 py-2 rounded dark:bg-gray-900 dark:text-white w-full"
          />
        </div>

        <div className="mb-4 flex gap-3">
          <button
            onClick={() => setEditing({})}
            className="px-4 py-2 bg-indigo-600 text-white rounded flex items-center gap-2"
          >
            <FaPlus /> Debt
          </button>
          <button
            onClick={() => setShowReminderForm(true)}
            className="px-4 py-2 bg-yellow-600 text-white rounded flex items-center gap-2"
          >
            <FaBell /> Set Debt Reminders
          </button>
        </div>

        <div ref={debtsRef} className="overflow-x-auto">
          <table className="min-w-full text-sm border rounded-lg">
            <thead className="bg-gray-100 dark:bg-gray-900 dark:text-indigo-600">
              <tr>
                <th className="text-left px-4 py-2 border-b">Customer</th>
                <th className="text-left px-4 py-2 border-b">Product</th>
                <th className="text-left px-4 py-2 border-b">Supplier</th>
                <th className="text-left px-4 py-2 border-b">Device IDs</th>
                <th className="text-left px-4 py-2 border-b">Qty</th>
                <th className="text-left px-4 py-2 border-b">Owed</th>
                <th className="text-left px-4 py-2 border-b">Deposited</th>
                <th className="text-left px-4 py-2 border-b">Remaining Balance</th>
                <th className="text-left px-4 py-2 border-b">Date</th>
               
              </tr>
            </thead>
            <tbody>
              {filteredDebts.map(d => (
                <tr key={d.id} className="hover:bg-gray-100 dark:bg-gray-900 dark:text-white">
                  <td className="px-4 py-2 border-b truncate">{d.customer_name}</td>
                  <td className="px-4 py-2 border-b truncate">{d.product_name}</td>
                  <td className="px-4 py-2 border-b truncate">{d.supplier || '-'}</td>
                  <td className="px-4 py-2 border-b truncate">
                    <button
                      onClick={() => setShowDetail(d)}
                      className="text-indigo-600 hover:underline focus:outline-none"
                    >
                      View {d.deviceIds.length} ID{d.deviceIds.length !== 1 ? 's' : ''}
                    </button>
                  </td>
                  <td className="px-4 py-2 border-b">{d.qty}</td>
                  <td className="px-4 py-2 border-b">₦{(d.owed || 0).toFixed(2)}</td>
                  <td className="px-4 py-2 border-b">₦{(d.deposited || 0).toFixed(2)}</td>
                  <td className="px-4 py-2 border-b">₦{(d.remaining_balance || 0).toFixed(2)}</td>
                  <td className="px-4 py-2 border-b">{d.date}</td>
                  
                </tr>
              ))}
              {filteredDebts.length === 0 && (
                <tr>
                  <td colSpan="10" className="text-center text-gray-500 py-4 dark:bg-gray-900 dark:text-white">
                    No debts found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center p-4 z-50 overflow-auto mt-24">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-6 dark:bg-gray-900 dark:text-white">
            <h2 className="text-xl font-bold text-center">{editing.id ? 'Edit Debt' : 'Add Debt'}</h2>

            {debtEntries.map((entry, index) => (
              <div key={index} className="border p-4 rounded-lg space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-semibold">Debt Entry {index + 1}</h3>
                  {debtEntries.length > 1 && (
                    <button
                      onClick={() => removeDebtEntry(index)}
                      className="text-red-600 hover:text-red-800"
                    >
                      Remove
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="block">
                    <span className="font-semibold block mb-1">Customer</span>
                    <select
                      name="customer_id"
                      value={editing.id ? editing.customer_id : entry.customer_id}
                      onChange={e => editing.id ? setEditing(prev => ({ ...prev, customer_id: e.target.value })) : handleDebtChange(index, e)}
                      className="border p-2 w-full rounded dark:bg-gray-900 dark:text-white"
                      required
                    >
                      <option value="">Select Customer</option>
                      {customers.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.fullname}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="font-semibold block mb-1">Product</span>
                    <select
                      name="dynamic_product_id"
                      value={editing.id ? editing.dynamic_product_id : entry.dynamic_product_id}
                      onChange={e => editing.id ? setEditing(prev => ({ ...prev, dynamic_product_id: e.target.value })) : handleDebtChange(index, e)}
                      className="border p-2 w-full rounded dark:bg-gray-900 dark:text-white"
                      required
                    >
                      <option value="">Select Product</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="font-semibold block mb-1">Supplier</span>
                    <input
                      name="supplier"
                      value={editing.id ? editing.supplier : entry.supplier}
                      onChange={e => editing.id ? setEditing(prev => ({ ...prev, supplier: e.target.value })) : handleDebtChange(index, e)}
                      className="border p-2 w-full rounded dark:bg-gray-900 dark:text-white"
                    />
                  </label>

                  <label className="block">
                    <span className="font-semibold block mb-1">Quantity</span>
                    <input
                      type="number"
                      name="qty"
                      value={editing.id ? editing.qty : entry.qty}
                      onChange={e => editing.id ? setEditing(prev => ({ ...prev, qty: e.target.value })) : handleDebtChange(index, e)}
                      className="border p-2 w-full rounded dark:bg-gray-900 dark:text-white"
                      required
                      min="1"
                    />
                  </label>

                  <label className="block">
                    <span className="font-semibold block mb-1">Owed</span>
                    <input
                      type="number"
                      name="owed"
                      value={editing.id ? editing.owed : entry.owed}
                      onChange={e => editing.id ? setEditing(prev => ({ ...prev, owed: e.target.value })) : handleDebtChange(index, e)}
                      className="border p-2 w-full rounded dark:bg-gray-900 dark:text-white"
                      required
                      min="0"
                      step="0.01"
                    />
                  </label>

                  <label className="block">
                    <span className="font-semibold block mb-1">Deposited</span>
                    <input
                      type="number"
                      name="deposited"
                      value={editing.id ? editing.deposited : entry.deposited}
                      onChange={e => editing.id ? setEditing(prev => ({ ...prev, deposited: e.target.value })) : handleDebtChange(index, e)}
                      className="border p-2 w-full rounded dark:bg-gray-900 dark:text-white"
                      min="0"
                      step="0.01"
                    />
                  </label>

                  <label className="block">
                    <span className="font-semibold block mb-1">Date</span>
                    <input
                      type="date"
                      name="date"
                      value={editing.id ? editing.date : entry.date}
                      onChange={e => editing.id ? setEditing(prev => ({ ...prev, date: e.target.value })) : handleDebtChange(index, e)}
                      className="border p-2 w-full rounded dark:bg-gray-900 dark:text-white"
                      required
                    />
                  </label>

                  <div className="block sm:col-span-2">
                    <span className="font-semibold block mb-1">Device IDs and Sizes</span>
                    {(editing.id ? editing.deviceIds : entry.deviceIds).map((id, deviceIdx) => (
                      <div key={deviceIdx} className="flex flex-wrap gap-2 mt-2 items-center">
                        <input
                          value={id}
                          onChange={e => editing.id ? handleEditDeviceIdChange(deviceIdx, e.target.value) : handleDeviceIdChange(index, deviceIdx, e.target.value)}
                          placeholder="Device ID"
                          className="flex-1 p-2 border rounded dark:bg-gray-900 dark:text-white min-w-[150px]"
                        />
                        <input
                          value={editing.id ? editing.deviceSizes[deviceIdx] || '' : entry.deviceSizes[deviceIdx] || ''}
                          onChange={e => editing.id ? handleEditDeviceSizeChange(deviceIdx, e.target.value) : handleDeviceSizeChange(index, deviceIdx, e.target.value)}
                          placeholder="Device Size"
                          className="flex-1 p-2 border rounded dark:bg-gray-900 dark:text-white min-w-[150px]"
                        />
                        <button
                          type="button"
                          onClick={() => openScanner(editing.id ? 'edit' : 'add', index, deviceIdx)}
                          className="p-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
                          title="Scan Barcode"
                        >
                          <FaCamera />
                        </button>
                        <button
                          type="button"
                          onClick={() => editing.id ? removeEditDeviceIdField(deviceIdx) : removeDeviceIdField(index, deviceIdx)}
                          className="text-red-600 hover:text-red-800"
                          title="Remove"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => editing.id ? addEditDeviceIdField() : addDeviceIdField(index)}
                      className="mt-2 text-indigo-600 hover:underline text-sm"
                    >
                      + Add Device ID
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {!editing.id && (
              <button
                onClick={addDebtEntry}
                className="px-4 py-2 bg-green-600 text-white rounded flex items-center gap-2"
              >
                <FaPlus /> Add Another Debt
              </button>
            )}

            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => { stopScanner(); setEditing(null); }} className="px-4 py-2 bg-gray-500 text-white rounded">
                Cancel
              </button>
              <button
                onClick={saveDebts}
                className="px-4 py-2 bg-indigo-600 text-white rounded"
              >
                {editing.id ? 'Save Debt' : 'Create Debt'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDetail && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 mt-24">
          <div className="bg-white p-6 rounded max-w-lg w-full max-h-[90vh] overflow-y-auto dark:bg-gray-900 dark:text-white">
            <h2 className="text-xl font-bold mb-4">{showDetail.product_name} Device IDs</h2>

            {isLoadingSoldStatus ? (
              <div className="flex justify-center py-4">
                <p>Loading device status...</p>
              </div>
            ) : (
              <div>
                <ul className="mt-2 divide-y divide-gray-200 dark:divide-gray-700">
                  {paginatedDevices.map((device, i) => {
                    const q = searchTerm.trim().toLowerCase();
                    const match = device.id.toLowerCase().includes(q) || device.size.toLowerCase().includes(q);
                    const isSold = soldDeviceIds.includes(device.id);
                    const displayText = `ID: ${device.id} (size: ${device.size})`;

                    return (
                      <li
                        key={i}
                        className={['py-2 px-1 flex items-center justify-between', match ? 'bg-yellow-50 dark:bg-yellow-800' : ''].filter(Boolean).join(' ')}
                      >
                        <div className="flex items-center">
                          <span className={match ? 'font-semibold' : ''}>{displayText}</span>
                          {isSold && (
                            <span className="ml-2 px-2 py-1 text-xs font-semibold bg-red-100 text-red-800 rounded-full dark:bg-red-900 dark:text-red-300">
                              SOLD
                            </span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>

                {totalDetailPages > 1 && (
                  <div className="flex justify-between items-center mt-4 text-sm text-gray-700 dark:text-gray-300">
                    <button
                      onClick={() => setDetailPage(p => Math.max(p - 1, 1))}
                      disabled={detailPage === 1}
                      className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-50 dark:bg-gray-700 dark:hover:bg-gray-600"
                    >
                      Prev
                    </button>
                    <span>
                      Page {detailPage} of {totalDetailPages}
                    </span>
                    <button
                      onClick={() => setDetailPage(p => Math.min(p + 1, totalDetailPages))}
                      disabled={detailPage === totalDetailPages}
                      className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-50 dark:bg-gray-700 dark:hover:bg-gray-600"
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setShowDetail(null)}
                className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showScanner && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-900 p-6 rounded max-w-lg w-full">
            <h2 className="text-xl font-semibold mb-3 text-gray-900 dark:text-white">Scan Barcode ID</h2>
            <div className="mb-4">
              <label className="flex items-center space-x-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={externalScannerMode}
                  onChange={() => {
                    setExternalScannerMode(prev => !prev);
                    setScannerError(null);
                    setScannerLoading(!externalScannerMode);
                    if (manualInputRef.current) {
                      manualInputRef.current.focus();
                    }
                  }}
                  className="h-4 w-4 text-indigo-600 border-gray-300 rounded dark:bg-gray-700 dark:border-gray-600"
                />
                <span>Use External Barcode Scanner</span>
              </label>
            </div>
            {!externalScannerMode && (
              <>
                {scannerLoading && (
                  <div className="text-gray-600 dark:text-gray-400 mb-4">Initializing scanner...</div>
                )}
                {scannerError && (
                  <div className="text-red-600 dark:text-red-400 mb-4">{scannerError}</div>
                )}
                <div
                  id="scanner"
                  ref={scannerDivRef}
                  className="relative w-full h-64 mb-4 bg-gray-100 dark:bg-gray-800"
                >
                  <video
                    ref={videoRef}
                    className="w-full h-full object-cover rounded"
                    autoPlay
                    playsInline
                  />
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-[250px] h-[100px] border-2 border-red-500 bg-transparent opacity-50"></div>
                  </div>
                </div>
              </>
            )}
            {externalScannerMode && (
              <div className="text-gray-600 dark:text-gray-400 mb-4">
                Waiting for external scanner input... Scan a barcode to proceed.
              </div>
            )}
            <div className="mb-4 px-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Or Enter Barcode Manually
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  ref={manualInputRef}
                  value={manualInput}
                  onChange={e => setManualInput(e.target.value)}
                  onKeyDown={handleManualInputKeyDown}
                  placeholder="Enter barcode"
                  className="flex-1 p-2 border rounded dark:bg-gray-700 dark:text-white"
                />
                <button
                  type="button"
                  onClick={handleManualInput}
                  className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
                >
                  Submit
                </button>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  stopScanner();
                  setShowScanner(false);
                  setScannerTarget(null);
                  setScannerError(null);
                  setScannerLoading(false);
                  setManualInput('');
                  setExternalScannerMode(false);
                  setScannerBuffer('');
                }}
                className="px-4 py-2 bg-gray-600 text-white rounded"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {showReminderForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6 space-y-4 dark:bg-gray-900 dark:text-white">
            <h2 className="text-xl font-bold text-center">Set Debt Reminders</h2>
            <div className="space-y-4">
              <label className="block">
                <span className="font-semibold block mb-1">Reminder Type</span>
                <select
                  value={reminderType}
                  onChange={e => setReminderType(e.target.value)}
                  className="border p-2 w-full rounded dark:bg-gray-800 dark:text-white"
                >
                  <option value="one-time">One-Time</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </select>
              </label>
              <label className="block">
                <span className="font-semibold block mb-1">Reminder Time</span>
                <input
                  type="time"
                  value={reminderTime}
                  onChange={e => setReminderTime(e.target.value)}
                  className="border p-2 w-full rounded dark:bg-gray-800 dark:text-white"
                  required
                />
              </label>
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowReminderForm(false)}
                className="px-4 py-2 bg-gray-500 text-white rounded"
              >
                Cancel
              </button>
              <button
                onClick={scheduleReminders}
                className="px-4 py-2 bg-indigo-600 text-white rounded"
              >
                Set Reminder
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}