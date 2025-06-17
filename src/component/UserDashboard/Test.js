import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../../supabaseClient';
import { FaEdit, FaTrashAlt, FaPlus, FaCamera } from 'react-icons/fa';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { Html5Qrcode, Html5QrcodeSupportedFormats, Html5QrcodeScannerState } from 'html5-qrcode';

// Success sound for scan feedback
const playSuccessSound = () => {
  const audio = new Audio('https://freesound.org/data/previews/171/171671_2437358-lq.mp3');
  audio.play().catch((err) => console.error('Audio play error:', err));
};

function DynamicProducts() {
  const storeId = localStorage.getItem('store_id');

  // STATES
  const [products, setProducts] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState([
    { name: '', description: '', purchase_price: '', purchase_qty: '', selling_price: '', suppliers_name: '', deviceIds: [''], deviceSizes: [''], isQtyManuallySet: false},
  ]);
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    purchase_price: '',
    selling_price: '',
    qty: '',
    suppliers_name: '',
    deviceIds: [],
    deviceSizes: [],
    isQtyManuallySet: false,
  });
  const [showDetail, setShowDetail] = useState(null);
  const [soldDeviceIds, setSoldDeviceIds] = useState([]);
  const [isLoadingSoldStatus, setIsLoadingSoldStatus] = useState(false);
  const [refreshDeviceList, setRefreshDeviceList] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [scannerTarget, setScannerTarget] = useState(null); // { modal: 'add'|'edit', productIndex: number, deviceIndex: number }
  const [scannerError, setScannerError] = useState(null);
  const [scannerLoading, setScannerLoading] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [externalScannerMode, setExternalScannerMode] = useState(false);
  const [scannerBuffer, setScannerBuffer] = useState('');
  const [lastKeyTime, setLastKeyTime] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scanSuccess, setScanSuccess] = useState(false); // New state for scan feedback
  const itemsPerPage = 20;
  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const [detailPage, setDetailPage] = useState(1);
  const detailPageSize = 20;





  // Utility Function (add above the component)
const formatCurrency = (value) =>
  value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  // Scanner
  const videoRef = useRef(null);
  const scannerDivRef = useRef(null);
  const html5QrCodeRef = useRef(null);
  const manualInputRef = useRef(null);

  const filteredDevices = useMemo(() => {
    return showDetail?.deviceList || [];
  }, [showDetail]);

  const totalDetailPages = Math.ceil(filteredDevices.length / detailPageSize);

  const paginatedDevices = useMemo(() => {
    const start = (detailPage - 1) * detailPageSize;
    const end = start + detailPageSize;
    return filteredDevices.slice(start, end);
  }, [filteredDevices, detailPage]);

  // Auto-focus manual input
  useEffect(() => {
    if (showScanner && manualInputRef.current) {
      manualInputRef.current.focus();
    }
  }, [showScanner, scannerTarget]);

  const processScannedBarcode = useCallback((scannedCode) => {
  const trimmedCode = scannedCode.trim();
  console.log('Processing barcode:', { trimmedCode });

  if (!trimmedCode) {
    toast.error('Invalid barcode: Empty value');
    setScannerError('Invalid barcode: Empty value');
    return false;
  }

  if (scannerTarget) {
    const { modal, productIndex, deviceIndex } = scannerTarget;
    let newDeviceIndex;

    if (modal === 'add') {
      const form = [...addForm];
      if (form[productIndex].deviceIds.some((id, i) => id.trim().toLowerCase() === trimmedCode.toLowerCase())) {
        toast.error(`Barcode "${trimmedCode}" already exists in this product`);
        setScannerError(`Barcode "${trimmedCode}" already exists`);
        return false;
      }
      form[productIndex].deviceIds[deviceIndex] = trimmedCode;
      form[productIndex].deviceIds.push('');
      form[productIndex].deviceSizes[deviceIndex] = form[productIndex].deviceSizes[deviceIndex] || '';
      form[productIndex].deviceSizes.push('');
      if (!form[productIndex].isQtyManuallySet) {
        const deviceCount = form[productIndex].deviceIds.filter((id) => id.trim()).length;
        form[productIndex].qty = deviceCount.toString();
      }
      setAddForm(form);
      newDeviceIndex = form[productIndex].deviceIds.length - 1;
    } else if (modal === 'edit') {
      if (editForm.deviceIds.some((id, i) => id.trim().toLowerCase() === trimmedCode.toLowerCase())) {
        toast.error(`Barcode "${trimmedCode}" already exists in this product`);
        setScannerError(`Barcode "${trimmedCode}" already exists`);
        return false;
      }
      const arrIds = [...editForm.deviceIds];
      const arrSizes = [...editForm.deviceSizes];
      arrIds[deviceIndex] = trimmedCode;
      arrIds.push('');
      arrSizes[deviceIndex] = arrSizes[deviceIndex] || '';
      arrSizes.push('');
      const updatedForm = {
        ...editForm,
        deviceIds: arrIds,
        deviceSizes: arrSizes,
      };
      if (!editForm.isQtyManuallySet) {
        const deviceCount = arrIds.filter((id) => id.trim()).length;
        updatedForm.qty = deviceCount.toString();
      }
      setEditForm(updatedForm);
      newDeviceIndex = arrIds.length - 1;
    }

    setScannerTarget({
      modal,
      productIndex,
      deviceIndex: newDeviceIndex,
    });
    setScannerError(null);
    toast.success(`Scanned barcode: ${trimmedCode}`);
    return true;
  }
  return false;
}, [scannerTarget, addForm, editForm]);




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
        setScannerBuffer((prev) => prev + e.key);
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

    console.log('Scanner modal opened:', {
      modal: scannerTarget?.modal,
      productIndex: scannerTarget?.productIndex,
      deviceIndex: scannerTarget?.deviceIndex,
      scannerDivExists: !!document.getElementById('scanner'),
    });

    setScannerLoading(true);
    setScanSuccess(false);

    const videoElement = videoRef.current;
    let html5QrCodeInstance = null;

    try {
      if (!document.getElementById('scanner')) {
        console.error('Scanner div not found in DOM');
        setScannerError('Scanner container not found. Please use manual input.');
        setScannerLoading(false);
        toast.error('Scanner container not found. Please use manual input.');
        return;
      }

      html5QrCodeInstance = new Html5Qrcode('scanner');
      html5QrCodeRef.current = html5QrCodeInstance;
      console.log('Html5Qrcode instance created successfully');
    } catch (err) {
      console.error('Failed to create Html5Qrcode instance:', err);
      setScannerError(`Failed to initialize scanner: ${err.message}`);
      setScannerLoading(false);
      toast.error('Failed to initialize scanner. Please use manual input.');
      return;
    }

    const config = {
      fps: 30, // Increased for faster processing
      qrbox: { width: 300, height: 150 }, // Larger capture area
      formatsToSupport: [
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.UPC_A,
      ], // Limited formats for speed
      aspectRatio: 16 / 9, // Modern aspect ratio
      disableFlip: true,
      videoConstraints: {
        facingMode: 'environment',
        width: { ideal: 1280 }, // Higher resolution
        height: { ideal: 720 },
        focusMode: 'continuous', // Enable autofocus
      },
    };

    const onScanSuccess = (decodedText) => {
      const success = processScannedBarcode(decodedText);
      if (success) {
        setScanSuccess(true);
        playSuccessSound();
        setTimeout(() => setScanSuccess(false), 1000); // Reset visual feedback
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
        console.debug('No barcode detected in frame');
      } else {
        console.error('Scan error:', error);
        setScannerError(`Scan error: ${error}. Try adjusting lighting or distance.`);
      }
    };

    const startScanner = async (attempt = 1, maxAttempts = 3) => {
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
      console.log(`Starting webcam scanner (attempt ${attempt})`);
      try {
        let stream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              ...config.videoConstraints,
              advanced: [{ focusMode: 'continuous' }],
            },
          });
        } catch (err) {
          console.warn('Rear camera with autofocus failed, trying fallback:', err);
          stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          });
        }
        videoElement.srcObject = stream;
        await new Promise((resolve) => {
          videoElement.onloadedmetadata = () => resolve();
        });
        await html5QrCodeInstance.start(
          config.videoConstraints,
          config,
          onScanSuccess,
          onScanFailure
        );
        console.log('Webcam scanner started successfully');
        setScannerLoading(false);
      } catch (err) {
        console.error('Scanner initialization error:', err);
        setScannerError(`Failed to initialize scanner: ${err.message}`);
        setScannerLoading(false);
        if (err.name === 'NotAllowedError') {
          toast.error('Camera access denied. Please allow camera permissions.');
        } else if (err.name === 'NotFoundError') {
          toast.error('No camera found. Please use manual input.');
        } else if (err.name === 'OverconstrainedError') {
          toast.error('Camera constraints not supported. Trying fallback...');
          setTimeout(() => startScanner(attempt + 1, maxAttempts), 200);
        } else {
          toast.error('Failed to start camera. Please use manual input.');
        }
      }
    };

    Html5Qrcode.getCameras()
      .then((cameras) => {
        console.log('Available cameras:', cameras.map(c => ({ id: c.id, label: c.label })));
        if (cameras.length === 0) {
          setScannerError('No cameras detected. Please use manual input.');
          setScannerLoading(false);
          toast.error('No cameras detected. Please use manual input.');
          return;
        }
        startScanner();
      })
      .catch((err) => {
        console.error('Error listing cameras:', err);
        setScannerError(`Failed to access cameras: ${err.message}`);
        setScannerLoading(false);
        toast.error('Failed to access cameras. Please use manual input.');
      });

    return () => {
      console.log('Scanner cleanup initiated');
      if (html5QrCodeInstance && 
          [Html5QrcodeScannerState.SCANNING, Html5QrcodeScannerState.PAUSED].includes(
            html5QrCodeInstance.getState()
          )) {
        html5QrCodeInstance
          .stop()
          .then(() => console.log('Webcam scanner stopped successfully'))
          .catch((err) => console.error('Error stopping scanner:', err));
      }
      if (videoElement && videoElement.srcObject) {
        videoElement.srcObject.getTracks().forEach((track) => {
          console.log('Stopping video track:', track.label);
          track.stop();
        });
        videoElement.srcObject = null;
      }
      html5QrCodeRef.current = null;
    };
  }, [showScanner, scannerTarget, externalScannerMode, processScannedBarcode]);

  // Stop scanner
  const stopScanner = useCallback(() => {
    console.log('Stopping scanner');
    if (html5QrCodeRef.current && 
        [Html5QrcodeScannerState.SCANNING, Html5QrcodeScannerState.PAUSED].includes(
          html5QrCodeRef.current.getState()
        )) {
      html5QrCodeRef.current
        .stop()
        .then(() => console.log('Scanner stopped successfully'))
        .catch((err) => console.error('Error stopping scanner:', err));
    }
    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject.getTracks().forEach((track) => {
        console.log('Stopped video track:', track.label);
        track.stop();
      });
      videoRef.current.srcObject = null;
    }
    html5QrCodeRef.current = null;
  }, []);

  // Fetch products
const fetchProducts = useCallback(async () => {
  if (!storeId) {
    toast.error('Store ID not found');
    return;
  }
  try {
    const { data: productsData, error: productsError } = await supabase
      .from('dynamic_product')
      .select('id, name, description, purchase_price, purchase_qty, selling_price, suppliers_name, device_id, dynamic_product_imeis, device_size, created_at')
      .eq('store_id', storeId)
      .order('id', { ascending: true });
    if (productsError) throw productsError;

    const { data: inventoryData, error: inventoryError } = await supabase
      .from('dynamic_inventory')
      .select('dynamic_product_id, available_qty')
      .eq('store_id', storeId);
    if (inventoryError) throw inventoryError;

    const inventoryMap = new Map(inventoryData.map((inv) => [inv.dynamic_product_id, inv.available_qty]));

    const withIds = productsData.map((p) => ({
      ...p,
      deviceList: p.dynamic_product_imeis ? p.dynamic_product_imeis.split(',').filter((id) => id.trim()) : [],
      sizeList: p.device_size ? p.device_size.split(',').filter((size) => size.trim()) : [],
      available_qty: inventoryMap.get(p.id) ?? p.purchase_qty ?? p.dynamic_product_imeis?.split(',').filter((id) => id.trim()).length ?? 0,
    }));
    setProducts(withIds);
    setFiltered(withIds);
  } catch (error) {
    console.error('Fetch products error:', error);
    toast.error('Failed to fetch products');
  }
}, [storeId]);



  useEffect(() => {
    fetchProducts();
  }, [fetchProducts, refreshDeviceList]);

  // Search filter
  useEffect(() => {
    const q = search.trim().toLowerCase();
    if (!q) {
      setFiltered(products);
    } else {
      setFiltered(
        products.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.deviceList.some((id) => id.toLowerCase().includes(q)) ||
            p.sizeList.some((size) => size.toLowerCase().includes(q))
        )
      );
    }
    setCurrentPage(1);
  }, [search, products]);

  // Check sold devices
  const checkSoldDevices = useCallback(async (deviceIds) => {
    if (!deviceIds || deviceIds.length === 0) return [];
    setIsLoadingSoldStatus(true);
    try {
      const normalizedIds = deviceIds.map((id) => id.trim());
      const { data, error } = await supabase
        .from('dynamic_sales')
        .select('device_id')
        .in('device_id', normalizedIds);
      if (error) throw error;
      const soldIds = data.map((item) => item.device_id.trim());
      setSoldDeviceIds(soldIds);
      return soldIds;
    } catch (error) {
      console.error('Error fetching sold devices:', error);
      toast.error('Failed to check sold devices');
      return [];
    } finally {
      setIsLoadingSoldStatus(false);
    }
  }, []);

  useEffect(() => {
    if (showDetail && showDetail.deviceList.length > 0) {
      checkSoldDevices(showDetail.deviceList);
    } else {
      setSoldDeviceIds([]);
    }
  }, [showDetail, checkSoldDevices]);

  // Open scanner
  const openScanner = (modal, productIndex, deviceIndex) => {
    console.log('Opening scanner:', { modal, productIndex, deviceIndex });
    setScannerTarget({ modal, productIndex, deviceIndex });
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

 const removeDeviceId = async (deviceId) => {
  if (!showDetail) return;
  if (!window.confirm(`Remove device ID ${deviceId} from ${showDetail.name}?`)) return;
  try {
    const index = showDetail.deviceList.indexOf(deviceId);
    const updatedDeviceList = showDetail.deviceList.filter((id) => id !== deviceId);
    const updatedSizeList = showDetail.sizeList.filter((_, i) => i !== index);
    const { data: product, error: productError } = await supabase
      .from('dynamic_product')
      .select('purchase_qty')
      .eq('id', showDetail.id)
      .single();
    if (productError) throw productError;

    const currentQty = product.purchase_qty || updatedDeviceList.length;
    const newQty = Math.max(0, currentQty - 1);

    const { error } = await supabase
      .from('dynamic_product')
      .update({
        dynamic_product_imeis: updatedDeviceList.join(','),
        device_size: updatedSizeList.join(','),
        purchase_qty: newQty,
      })
      .eq('id', showDetail.id);
    if (error) throw error;

    const { data: inv } = await supabase
      .from('dynamic_inventory')
      .select('available_qty, quantity_sold')
      .eq('dynamic_product_id', showDetail.id)
      .eq('store_id', storeId)
      .maybeSingle();
    if (inv) {
      await supabase
        .from('dynamic_inventory')
        .update({
          available_qty: newQty,
          last_updated: new Date().toISOString(),
        })
        .eq('dynamic_product_id', showDetail.id)
        .eq('store_id', storeId);
    }

    setShowDetail({
      ...showDetail,
      deviceList: updatedDeviceList,
      sizeList: updatedSizeList,
      purchase_qty: newQty,
      available_qty: newQty,
    });
    setRefreshDeviceList((prev) => !prev);
    toast.success('Device ID removed');
  } catch (error) {
    console.error('Error removing device ID:', error);
    toast.error('Failed to remove device ID');
  }
};


  // Pagination
  const paginated = useMemo(
    () => filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage),
    [filtered, currentPage]
  );

  // Add handlers
  const handleAddChange = (idx, field, val) => {
  const f = [...addForm];
  f[idx][field] = val;
  if (field === 'qty') {
    f[idx].isQtyManuallySet = val !== '';
  }
  setAddForm(f);
};

const handleAddId = (pIdx, iIdx, val) => {
  const f = [...addForm];
  const trimmedVal = val.trim();
  if (trimmedVal && f[pIdx].deviceIds.some((id, i) => i !== iIdx && id.trim().toLowerCase() === trimmedVal.toLowerCase())) {
    toast.error(`Barcode "${trimmedVal}" already exists in this product`);
    return;
  }
  f[pIdx].deviceIds[iIdx] = val;
  if (!f[pIdx].isQtyManuallySet) {
    const deviceCount = f[pIdx].deviceIds.filter((id) => id.trim()).length;
    f[pIdx].qty = deviceCount.toString();
  }
  setAddForm(f);
};






  const handleAddSize = (pIdx, iIdx, val) => {
    const f = [...addForm];
    f[pIdx].deviceSizes[iIdx] = val || '';
    setAddForm(f);
  };

 const addIdField = (pIdx) => {
  const f = [...addForm];
  f[pIdx].deviceIds.push('');
  f[pIdx].deviceSizes.push('');
  if (!f[pIdx].isQtyManuallySet) {
    const deviceCount = f[pIdx].deviceIds.filter((id) => id.trim()).length;
    f[pIdx].qty = deviceCount.toString();
  }
  setAddForm(f);
};

const removeIdField = (pIdx, iIdx) => {
  const f = [...addForm];
  f[pIdx].deviceIds.splice(iIdx, 1);
  f[pIdx].deviceSizes.splice(iIdx, 1);
  if (!f[pIdx].isQtyManuallySet) {
    const deviceCount = f[pIdx].deviceIds.filter((id) => id.trim()).length;
    f[pIdx].qty = deviceCount.toString();
  }
  setAddForm(f);
};


  const addAnotherProduct = () => {
    setAddForm((prev) => [
      ...prev,
      {
        name: '',
        description: '',
        purchase_price: '',
        purchase_qty: '',
        selling_price: '',
        suppliers_name: '',
        deviceIds: [''],
        deviceSizes: [''],
      },
    ]);
  };

  const removeProductForm = (index) => {
    setAddForm((prev) => prev.filter((_, i) => i !== index));
  };

  // Create products
 const createProducts = async (e) => {
  e.preventDefault();
  if (!addForm.length) {
    toast.error('Add at least one product');
    return;
  }
  for (const p of addForm) {
    if (!p.name.trim()) {
      toast.error('Product name is required');
      return;
    }
  }

  try {
    const allNewIds = addForm
      .flatMap((p) => p.deviceIds.filter((id) => id.trim()).map((id) => id.trim()));
    if (allNewIds.length > 0) {
      const uniqueNewIds = new Set([...allNewIds.map((id) => id.toLowerCase())]);
      if (uniqueNewIds.size < allNewIds.length) {
        toast.error('Duplicate Device IDs detected within the new products');
        return;
      }

      const { data: existingProducts, error: fetchError } = await supabase
        .from('dynamic_product')
        .select('id, dynamic_product_imeis')
        .eq('store_id', storeId);
      if (fetchError) throw fetchError;

      const existingIds = existingProducts
        .flatMap((p) =>
          p.dynamic_product_imeis ? p.dynamic_product_imeis.split(',').map((id) => id.trim()) : []
        )
        .filter((id) => id);
      const duplicates = allNewIds.filter((id) =>
        existingIds.some((eId) => eId.toLowerCase() === id.toLowerCase())
      );
      if (duplicates.length > 0) {
        toast.error(`Duplicate Device IDs already exist in other products: ${duplicates.join(', ')}`);
        return;
      }
    }

    const productsToInsert = [...addForm].map((p) => {
      const cleanedDeviceIds = p.deviceIds.filter((d) => d.trim());
      const qty = parseInt(p.qty) || cleanedDeviceIds.length;
      return {
        store_id: storeId,
        name: p.name,
        description: p.description || '',
        purchase_price: parseFloat(p.purchase_price) || 0,
        purchase_qty: qty,
        selling_price: parseFloat(p.selling_price) || 0,
        suppliers_name: p.suppliers_name || '',
        dynamic_product_imeis: cleanedDeviceIds.join(','),
        device_size: cleanedDeviceIds.length > 0
          ? p.deviceSizes
              .filter((_, i) => p.deviceIds[i].trim())
              .map((s) => s?.trim() || '')
              .join(',')
          : '',
      };
    });
    const { data: newProds, error } = await supabase
      .from('dynamic_product')
      .insert(productsToInsert)
      .select('id, dynamic_product_imeis, purchase_qty');
    if (error) throw error;

    const invUpdates = newProds.map((p, idx) => ({
      dynamic_product_id: p.id,
      store_id: storeId,
      available_qty: parseInt(addForm[idx].qty) || p.dynamic_product_imeis.split(',').filter((id) => id.trim()).length,
      quantity_sold: 0,
      last_updated: new Date().toISOString(),
    }));
    await supabase
      .from('dynamic_inventory')
      .upsert(invUpdates, { onConflict: ['dynamic_product_id', 'store_id'] });

    toast.success('Products added');
    stopScanner();
    setShowAdd(false);
    setAddForm([
      {
        name: '',
        description: '',
        purchase_price: '',
        qty: '',
        selling_price: '',
        suppliers_name: '',
        deviceIds: [''],
        deviceSizes: [''],
        isQtyManuallySet: false,
      },
    ]);
    fetchProducts();
  } catch (error) {
    console.error('Create products error:', error);
    toast.error('Failed to add products');
  }
};
const openEdit = (p) => {
  const deviceIds = p.deviceList && p.deviceList.length > 0 ? [...p.deviceList, ''] : [''];
  const sizeList = p.sizeList || [];
  const deviceSizes = deviceIds.map((_, i) => (i < sizeList.length ? sizeList[i] : ''));
  setEditing({
    ...p,
    deviceIds,
    deviceSizes,
  });
  setEditForm({
    name: p.name || '',
    description: p.description || '',
    purchase_price: p.purchase_price || '',
    qty: p.purchase_qty?.toString() || '',
    selling_price: p.selling_price || '',
    suppliers_name: p.suppliers_name || '',
    deviceIds,
    deviceSizes,
    isQtyManuallySet: !!p.purchase_qty,
  });
};


 const handleEditChange = (field, value) => {
  setEditForm((prev) => ({
    ...prev,
    [field]: value,
    ...(field === 'qty' && { isQtyManuallySet: value !== '' }),
  }));
};



const handleDeviceIdChange = (idx, val) => {
  const trimmedVal = val.trim();
  if (trimmedVal && editForm.deviceIds.some((id, i) => i !== idx && id.trim().toLowerCase() === trimmedVal.toLowerCase())) {
    toast.error(`Barcode "${trimmedVal}" already exists in this product`);
    return;
  }
  const arrIds = [...editForm.deviceIds];
  arrIds[idx] = val;
  const updatedForm = {
    ...editForm,
    deviceIds: arrIds,
    deviceSizes: editForm.deviceSizes.length === arrIds.length ? editForm.deviceSizes : arrIds.map((_, i) => editForm.deviceSizes[i] || ''),
  };
  if (!editForm.isQtyManuallySet) {
    const deviceCount = arrIds.filter((id) => id.trim()).length;
    updatedForm.qty = deviceCount.toString();
  }
  setEditForm(updatedForm);
};



  const handleDeviceSizeChange = (idx, val) => {
    const arrSizes = [...editForm.deviceSizes || []];
    arrSizes[idx] = val || '';
    setEditForm((prev) => ({
      ...prev,
      deviceSizes: arrSizes,
    }));
  };

const addDeviceId = () => {
  const updatedForm = {
    ...editForm,
    deviceIds: [...editForm.deviceIds, ''],
    deviceSizes: [...(editForm.deviceSizes || []), ''],
  };
  if (!editForm.isQtyManuallySet) {
    const deviceCount = updatedForm.deviceIds.filter((id) => id.trim()).length;
    updatedForm.qty = deviceCount.toString();
  }
  setEditForm(updatedForm);
};

const removeEditDeviceId = (idx) => {
  const updatedForm = {
    ...editForm,
    deviceIds: editForm.deviceIds.filter((_, i) => i !== idx),
    deviceSizes: (editForm.deviceSizes || []).filter((_, i) => i !== idx),
  };
  if (!editForm.isQtyManuallySet) {
    const deviceCount = updatedForm.deviceIds.filter((id) => id.trim()).length;
    updatedForm.qty = deviceCount.toString();
  }
  setEditForm(updatedForm);
};

const saveEdit = async () => {
  if (!editForm.name.trim()) {
    toast.error('Product name is required');
    return;
  }
  if (!editForm.qty && editForm.deviceIds.filter((id) => id.trim()).length === 0) {
    toast.error('Either Quantity or at least one Device ID is required');
    return;
  }



const cleanedDeviceIds = editForm.deviceIds
    .filter((id) => id && id.trim())
    .map((id) => id.trim());
  const newQty = parseInt(editForm.qty) || cleanedDeviceIds.length;
  const cleanedDeviceSizes = cleanedDeviceIds.length > 0
    ? Array(cleanedDeviceIds.length)
        .fill('')
        .map((_, i) => (editForm.deviceSizes[i] || '').trim())
    : [];

  try {
    if (cleanedDeviceIds.length > 0) {
      const uniqueIds = new Set(cleanedDeviceIds.map((id) => id.toLowerCase()));
      if (uniqueIds.size < cleanedDeviceIds.length) {
        toast.error('Duplicate Device IDs detected within this product');
        return;
      }

      const { data: existingProducts, error: fetchError } = await supabase
        .from('dynamic_product')
        .select('id, dynamic_product_imeis')
        .eq('store_id', storeId)
        .neq('id', editing.id);
      if (fetchError) throw fetchError;

      const existingIds = existingProducts
        .flatMap((p) =>
          p.dynamic_product_imeis ? p.dynamic_product_imeis.split(',').map((id) => id.trim()) : []
        )
        .filter((id) => id);
      const duplicates = cleanedDeviceIds.filter((id) =>
        existingIds.some((eId) => eId.toLowerCase() === id.toLowerCase())
      );
      if (duplicates.length > 0) {
        toast.error(`Device IDs already exist in other products: ${duplicates.join(', ')}`);
        return;
      }
    }

    // Fetch current product and inventory data
    const { data: currentProduct, error: prodError } = await supabase
      .from('dynamic_product')
      .select('purchase_qty')
      .eq('id', editing.id)
      .single();
    if (prodError) throw prodError;

    const { data: inv, error: invError } = await supabase
      .from('dynamic_inventory')
      .select('available_qty, quantity_sold')
      .eq('dynamic_product_id', editing.id)
      .eq('store_id', storeId)
      .maybeSingle();
    if (invError) throw invError;

    // Calculate restock amount
    const prevQty = currentProduct.purchase_qty || cleanedDeviceIds.length;
    const restockAmount = newQty - prevQty;

    // Update product
    const { error: updateProdErr } = await supabase
      .from('dynamic_product')
      .update({
        name: editForm.name,
        description: editForm.description || '',
        purchase_price: parseFloat(editForm.purchase_price) || 0,
        purchase_qty: newQty,
        selling_price: parseFloat(editForm.selling_price) || 0,
        suppliers_name: editForm.suppliers_name || '',
        dynamic_product_imeis: cleanedDeviceIds.join(','),
        device_size: cleanedDeviceSizes.join(','),
      })
      .eq('id', editing.id);
    if (updateProdErr) throw updateProdErr;

    // Update inventory by adding restock amount
    const currentAvailQty = inv?.available_qty || 0;
    const newAvailQty = Math.max(0, currentAvailQty + restockAmount);

    await supabase
      .from('dynamic_inventory')
      .upsert(
        {
          dynamic_product_id: editing.id,
          store_id: storeId,
          available_qty: newAvailQty,
          quantity_sold: inv?.quantity_sold || 0,
          last_updated: new Date().toISOString(),
        },
        { onConflict: ['dynamic_product_id', 'store_id'] }
      );

    toast.success('Product updated successfully');
    stopScanner();
    setEditing(null);
    fetchProducts();
  } catch (error) {
    console.error('Save edit error:', error);
    toast.error('Failed to update product');
  }
};

  // Delete
  const deleteProduct = async (p) => {
    if (!window.confirm(`Delete ${p.name}?`)) return;
    try {
      await supabase.from('dynamic_product').delete().eq('id', p.id);
      await supabase
        .from('dynamic_inventory')
        .delete()
        .eq('dynamic_product_id', p.id)
        .eq('store_id', storeId);
      toast.success('Deleted');
      fetchProducts();
    } catch (error) {
      console.error('Delete product error:', error);
      toast.error('Failed to delete product');
    }
  };

  // Cancel add/edit
  const cancelAdd = () => {
  stopScanner();
  setShowAdd(false);
  setAddForm([
    {
      name: '',
      description: '',
      purchase_price: '',
      qty: '',
      selling_price: '',
      suppliers_name: '',
      deviceIds: [''],
      deviceSizes: [''],
    },
  ]);
};
  const cancelEdit = () => {
    stopScanner();
    setEditing(null);
  };

  return (
    <div className="p-0 mt-4 dark:bg-gray-900 dark:text-white mt-48">
      <ToastContainer />
      <div className="flex flex-col sm:flex-row gap-2 mb-4 px-2 sm:px-0">
        <input
          type="text"
          placeholder="Search by name, Product ID, or Size..."
          className="w-full sm:flex-1 p-2 border rounded dark:bg-gray-800 dark:border-gray-700 dark:text-white"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          onClick={() => setShowAdd(true)}
          className="w-full sm:w-auto flex items-center justify-center sm:justify-start gap-2 px-4 py-2 bg-indigo-600 text-white rounded text-sm sm:text-base hover:bg-indigo-700 transition-all"
        >
          <FaPlus className="text-sm sm:text-base" />
          <span className="hidden sm:inline">Add</span>
        </button>
      </div>

     {showAdd && (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <form
      onSubmit={createProducts}
     className="bg-white dark:bg-gray-900 w-full max-w-5xl sm:rounded-lg shadow-lg space-y-6 p-4 sm:p-6 max-h-[90vh] overflow-y-auto"

    >
      <h2 className="text-2xl font-semibold text-gray-800 dark:text-white">Add Products</h2>

      {addForm.map((p, pi) => (
        <div
          key={pi}
          className="relative bg-gray-50 dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700"
        >
          {addForm.length > 1 && (
            <button
              type="button"
              onClick={() => removeProductForm(pi)}
              className="absolute top-4 right-4 text-red-500 hover:text-red-700 text-lg focus:outline-none"
              title="Remove this product"
            >
              <FaTrashAlt />
            </button>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              type="text"
              placeholder="Product Name"
              value={p.name}
              onChange={(e) => handleAddChange(pi, 'name', e.target.value)}
              className="p-2 border rounded w-full dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              required
            />


             <input
            type="number"
            placeholder="Quantity"
            value={p.qty}
            onChange={(e) => handleAddChange(pi, 'qty', e.target.value)}
            className="p-2 border rounded w-full dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          
            <input
              type="text"
              placeholder="Supplier Name"
              value={p.suppliers_name}
              onChange={(e) => handleAddChange(pi, 'suppliers_name', e.target.value)}
              className="p-2 border rounded w-full dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
            <textarea
              placeholder="Description"
              value={p.description}
              onChange={(e) => handleAddChange(pi, 'description', e.target.value)}
              className="p-2 border rounded w-full md:col-span-2 resize-none dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              rows={3}
            />
            <input
              type="number"
              step="0.01"
              placeholder="Purchase Price"
              value={p.purchase_price}
              onChange={(e) => handleAddChange(pi, 'purchase_price', e.target.value)}
              className="p-2 border rounded w-full dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
            <input
              type="number"
              step="0.01"
              placeholder="Selling Price"
              value={p.selling_price}
              onChange={(e) => handleAddChange(pi, 'selling_price', e.target.value)}
              className="p-2 border rounded w-full dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
      
    



                
      <div className="mt-4">
        <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
          Product IDs and Sizes
        </label>
        {p.deviceIds.map((id, i) => (
          <div key={i} className="flex flex-col sm:flex-row sm:items-center sm:gap-2 gap-2 mt-2">
            <input
              value={id}
              onChange={(e) => handleAddId(pi, i, e.target.value)}
              placeholder="Product/Device/Goods ID"
              className={`w-full sm:flex-1 p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white ${
                id.trim() &&
                p.deviceIds.some((otherId, j) => j !== i && otherId.trim().toLowerCase() === id.trim().toLowerCase())
                  ? 'border-red-500'
                  : ''
              }`}
            />
            <input
              value={p.deviceSizes[i] || ''}
              onChange={(e) => handleAddSize(pi, i, e.target.value)}
              placeholder="Size (e.g., 128GB, Small, Large)"
              className="w-full sm:flex-1 p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => openScanner('add', pi, i)}
                className="p-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
                title="Scan Barcode"
              >
                <FaCamera />
              </button>
              {p.deviceIds.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeIdField(pi, i)}
                  className="p-2 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                  title="Remove ID"
                >
                  <FaTrashAlt />
                </button>
              )}
            </div>
    </div>
  ))}
  <button
    type="button"
    onClick={() => addIdField(pi)}
    className="mt-2 text-indigo-600 hover:underline text-sm dark:text-indigo-400"
  >
    + Add Product ID
  </button>
</div>
              </div>
            ))}

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 mt-4 px-2 sm:px-0">
              <button
                type="button"
                onClick={addAnotherProduct}
                className="text-indigo-600 hover:underline text-sm dark:text-indigo-400 text-left sm:text-center"
              >
                + Add Another Product
              </button>

              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                <button
                  type="button"
                  onClick={cancelAdd}
                  className="w-full sm:w-auto px-4 py-2 rounded bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="w-full sm:w-auto px-4 py-2 rounded bg-indigo-600 text-white hover:bg-indigo-700"
                >
                  Save
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

   <div className="overflow-x-auto bg-white dark:bg-gray-800 rounded shadow">
  <table className="min-w-full text-sm text-left text-gray-700 dark:text-gray-300">
    <thead className="bg-gray-100 dark:bg-gray-700 text-xs uppercase text-gray-600 dark:text-gray-400">
      <tr>
        <th className="px-4 py-3 whitespace-nowrap">Name</th>
        <th className="px-4 py-3 whitespace-nowrap">Desc.</th>
        <th className="px-4 py-3 whitespace-nowrap">Purchase</th>
        <th className="px-4 py-3 whitespace-nowrap">Qty</th>
        <th className="px-4 py-3 whitespace-nowrap">Selling</th>
        <th className="px-4 py-3 whitespace-nowrap">Supplier</th>
        <th className="px-4 py-3 whitespace-nowrap">Product ID</th>
        <th className="px-4 py-3 whitespace-nowrap">Date</th>
        <th className="px-4 py-3 whitespace-nowrap">Action</th>
      </tr>
    </thead>
    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
      {paginated.map((p) => (
        <tr
          key={p.id}
          className="hover:bg-gray-50 dark:hover:bg-gray-700 transition"
        >
          <td className="px-4 py-3 whitespace-nowrap">{p.name}</td>
          <td className="px-4 py-3 whitespace-nowrap">{p.description}</td>
          <td className="px-4 py-3 whitespace-nowrap">₦{formatCurrency(p.purchase_price || 0)}</td>
          <td className="px-4 py-3 whitespace-nowrap">{p.available_qty}</td>
          <td className="px-4 py-3 whitespace-nowrap">₦{formatCurrency(p.selling_price || 0)}</td>
          <td className="px-4 py-3 whitespace-nowrap">{p.suppliers_name}</td>
          <td className="px-4 py-3 whitespace-nowrap">
            <button
              onClick={() => setShowDetail(p)}
              className="text-indigo-600 hover:underline focus:outline-none dark:text-indigo-400"
            >
              {p.device_id || 'View'}
            </button>
          </td>
          <td className="px-4 py-3 whitespace-nowrap">
            {new Date(p.created_at).toLocaleDateString()}
          </td>
          <td className="px-4 py-3 whitespace-nowrap">
            <div className="flex items-center gap-3">
              <button
                onClick={() => openEdit(p)}
                className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300"
                title="Edit"
              >
                <FaEdit />
              </button>
              <button
                onClick={() => deleteProduct(p)}
                className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                title="Delete"
              >
                <FaTrashAlt />
              </button>
            </div>
          </td>
        </tr>
      ))}
    </tbody>
  </table>
</div>



      <div className="flex justify-center gap-2 mt-4">
        <button
          disabled={currentPage === 1}
          onClick={() => setCurrentPage((cp) => cp - 1)}
          className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-50 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-white"
        >
          Prev
        </button>
        <span className="px-3 py-1">
          {currentPage} / {totalPages || 1}
        </span>
        <button
          disabled={currentPage === totalPages || totalPages === 0}
          onClick={() => setCurrentPage((cp) => cp + 1)}
          className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-50 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-white"
        >
          Next
        </button>
      </div>

      {showDetail && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 mt-16">
          <div className="bg-white dark:bg-gray-900 p-6 rounded max-w-xl w-full max-h-[80vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4 text-gray-800 dark:text-white">
              {showDetail.name} Products IDs
            </h2>

            {isLoadingSoldStatus ? (
              <div className="flex justify-center py-4">
                <p className="text-gray-600 dark:text-gray-400">Loading Products status...</p>
              </div>
            ) : (
              <div>
                <ul className="mt-2 divide-y divide-gray-200 dark:divide-gray-700">
                  {paginatedDevices.map((id, i) => {
                    const q = search.trim().toLowerCase();
                    const size = showDetail.sizeList[i] || '';
                    const match = id.toLowerCase().includes(q) || size.toLowerCase().includes(q);
                    const isSold = soldDeviceIds.includes(id);
                    return (
                      <li
                        key={i}
                        className={`py-2 px-1 flex items-center justify-between ${
                          match ? 'bg-yellow-50 dark:bg-yellow-800' : ''
                        }`}
                      >
                        <div className="flex items-center">
                          <span className={match ? 'font-semibold' : ''}>
                            {id}{size ? ` (${size})` : ''}
                          </span>
                          {isSold && (
                            <span className="ml-2 px-2 py-1 text-xs font-semibold bg-red-100 text-red-800 rounded-full dark:bg-red-900 dark:text-red-300">
                              SOLD
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => removeDeviceId(id)}
                          className="ml-2 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                          title="Remove this device ID"
                        >
                          <FaTrashAlt size={14} />
                        </button>
                      </li>
                    );
                  })}
                </ul>

                {totalDetailPages > 1 && (
                  <div className="flex justify-between items-center mt-4 text-sm text-gray-700 dark:text-gray-300">
                    <button
                      onClick={() => setDetailPage((p) => Math.max(p - 1, 1))}
                      disabled={detailPage === 1}
                      className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-50 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-white"
                    >
                      Prev
                    </button>
                    <span>
                      Page {detailPage} of {totalDetailPages}
                    </span>
                    <button
                      onClick={() => setDetailPage((p) => Math.min(p + 1, totalDetailPages))}
                      disabled={detailPage === totalDetailPages}
                      className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-50 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-white"
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
                className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-2 z-50 mt-16">
          <div className="bg-white dark:bg-gray-900 p-3 rounded max-w-xl w-full max-h-[80vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4 text-gray-800 dark:text-white mt-6">Edit Productss</h2>

            <div className="space-y-4">
              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300">
                  Product Information
                </h3>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Product Name
                  </label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => handleEditChange('name', e.target.value)}
                    className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                   
                  />
                </div>
                
<div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Quantity
          </label>
          <input
            type="number"
            value={editForm.qty}
            onChange={(e) => handleEditChange('qty', e.target.value)}
            className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          />
        </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Description
                  </label>
                  <textarea
                    value={editForm.description}
                    onChange={(e) => handleEditChange('description', e.target.value)}
                    className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    rows={3}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Purchase Price
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={editForm.purchase_price}
                      onChange={(e) => handleEditChange('purchase_price', e.target.value)}
                      className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Selling Price
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={editForm.selling_price}
                      onChange={(e) => handleEditChange('selling_price', e.target.value)}
                      className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Supplier Name
                  </label>
                  <input
                    type="text"
                    value={editForm.suppliers_name}
                    onChange={(e) => handleEditChange('suppliers_name', e.target.value)}
                    className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  />
                </div>
              </div>

              <div className="space-y-3 pt-4 border-t dark:border-gray-700">
                <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300">Products IDs and Sizes</h3>

                <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
    Products IDs and Sizes
  </label>
  {editForm.deviceIds.map((id, i) => (
    <div
      key={i}
      className="flex flex-col sm:flex-row sm:items-center sm:gap-2 gap-2 mt-2"
    >
      <input
        value={id}
        onChange={(e) => handleDeviceIdChange(i, e.target.value)}
        placeholder="Product/Device/Goods ID"
        className={`w-full sm:flex-1 p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white ${
          id.trim() &&
          editForm.deviceIds.some(
            (otherId, j) => j !== i && otherId.trim().toLowerCase() === id.trim().toLowerCase()
          )
            ? 'border-red-500'
            : ''
        }`}
      />
      <input
        value={editForm.deviceSizes[i] || ''}
        onChange={(e) => handleDeviceSizeChange(i, e.target.value)}
        placeholder="Size (e.g., 128GB, Small, Large)"
        className="w-full sm:flex-1 p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => openScanner('edit', 0, i)}
          className="p-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
          title="Scan Barcode"
        >
          <FaCamera />
        </button>
        {editForm.deviceIds.length > 1 && (
          <button
            type="button"
            onClick={() => removeEditDeviceId(i)}
            className="p-2 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
            title="Remove ID"
          >
            <FaTrashAlt />
          </button>
        )}
      </div>
    </div>
  ))}


                  <button
                    type="button"
                    onClick={addDeviceId}
                    className="mt-2 text-indigo-600 hover:underline text-sm dark:text-indigo-400"
                  >
                    + Add product ID
                  </button>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:justify-end gap-2 sm:gap-3 mt-6 px-2 sm:px-0">
              <button
                type="button"
                onClick={cancelEdit}
                className="w-full sm:w-auto px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveEdit}
                className="w-full sm:w-auto px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {showScanner && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-1 z-50">
          <div className="bg-white dark:bg-gray-900 p-6 rounded max-w-lg w-full">
            <h2 className="text-xl font-bold mb-4 text-gray-800 dark:text-white">Scan Barcode</h2>
            <div className="mb-4">
              <label className="flex items-center space-x-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={externalScannerMode}
                  onChange={() => {
                    setExternalScannerMode((prev) => !prev);
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
                  <div className="text-gray-600 dark:text-gray-400 mb-4">Initializing webcam scanner...</div>
                )}
                {scannerError && (
                  <div className="text-red-600 dark:text-red-400 mb-4">{scannerError}</div>
                )}
                <div className="mb-4 text-sm text-gray-600 dark:text-gray-400">
                  <p>Point the camera at the barcode (~10–15 cm away).</p>
                  <p>Ensure good lighting and steady hands.</p>
                </div>
                <div
                  id="scanner"
                  ref={scannerDivRef}
                  className={`relative w-full h-64 mb-4 bg-gray-100 dark:bg-gray-800 ${scanSuccess ? 'border-4 border-green-600' : ''}`}
                >
                  <video
                    ref={videoRef}
                    className="w-full h-full object-cover"
                    autoPlay
                    playsInline
                  />
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-[300px] h-[150px] border-2 border-red-500 bg-transparent rounded opacity-50"></div>
                  </div>
                </div>
              </>
            )}
            {externalScannerMode && (
              <>
                <div className="text-gray-600 dark:text-gray-400 mb-4">
                  Waiting for external scanner to proceed... Scan a barcode to proceed.
                </div>
                <div className="mb-4 px-2 sm:px-0">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Or enter barcode manually
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      ref={manualInputRef}
                      value={manualInput}
                      onChange={(e) => setManualInput(e.target.value)}
                      onKeyDown={handleManualInputKeyDown}
                      placeholder="Enter barcode"
                      className="p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white w-full sm:flex-1"
                    />
                    <button
                      type="button"
                      onClick={handleManualInput}
                      className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 w-full sm:w-auto"
                    >
                      Submit
                    </button>
                  </div>
                </div>
              </>
            )}

            <div className="flex justify-end px-2 sm:px-4">
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
                  setScanSuccess(false);
                }}
                className="w-full sm:w-auto px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-white text-center"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DynamicProducts;