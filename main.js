import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
    import { getFirestore, collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc, runTransaction, serverTimestamp, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

    const { createApp, ref, computed, onMounted } = Vue;
    const { createVuetify } = Vuetify;
    const vuetify = createVuetify();

    createApp({
      setup() {
        // --- KONFIGURASI FIREBASE ---
        const firebaseConfig = {
          apiKey: "AIzaSyAtcpD9xqIdd11TaTxCTt9gX-tXpyF0mEw",
          authDomain: "databasegudang-3f549.firebaseapp.com",
          projectId: "databasegudang-3f549",
          storageBucket: "databasegudang-3f549.firebasestorage.app",
          messagingSenderId: "724505523172",
          appId: "1:724505523172:web:c041add4db9abfd252cdf1",
          measurementId: "G-SXD15ZPFX7"
        };

        // --- Inisialisasi Firebase & Firestore ---
        const app = initializeApp(firebaseConfig);
        const db = getFirestore(app);
        const barangCol = collection(db, 'barang');
        const riwayatCol = collection(db, 'riwayat');

        // --- UI & Navigasi State ---
        const currentPage = ref('stok');
        const navValue = ref('stok');
        const search = ref('');
        const dialog = ref(false);
        const dialogMode = ref('tambah');
        const snackbar = ref({ show: false, text: '', color: 'success' });
        const isLoading = ref(true);
        const isSubmitting = ref(false);
        const tanggalMulai = ref(null);
        const tanggalSelesai = ref(null);

        // --- Data State ---
        const barang = ref([]);
        const riwayat = ref([]);
        
        // --- Form State ---
        const defaultItem = { kode: '', nama: '', stok: 0 };
        const editedItem = ref({ ...defaultItem });
        const formTransaksi = ref({ id: null, jumlah: null });

        // --- Headers Tabel ---
        const barangHeaders = [ { title: 'Kode', key: 'kode' }, { title: 'Nama Barang', key: 'nama' }, { title: 'Stok', key: 'stok' }, { title: 'Aksi', key: 'actions', sortable: false, align: 'end' }];
        const riwayatHeaders = [ { title: 'Tanggal', key: 'tanggal' }, { title: 'Kode', key: 'kodeBarang' }, { title: 'Nama Barang', key: 'namaBarang' }, { title: 'Tipe', key: 'tipe' }, { title: 'Jumlah', key: 'jumlah', align: 'end' }];
        
        // --- Computed Properties ---
        const pageTitle = computed(() => {
          const titles = { stok: 'Stok Barang', masuk: 'Form Barang Masuk', keluar: 'Form Barang Keluar', laporan: 'Laporan Transaksi' };
          return titles[currentPage.value] || 'Aplikasi Gudang';
        });
        const dialogTitle = computed(() => {
          const titles = { tambah: 'Barang Baru', edit: 'Edit Barang', hapus: 'Konfirmasi Hapus' };
          return titles[dialogMode.value] || '';
        });
        
        const filteredRiwayat = computed(() => {
            let data = riwayat.value;
            if (tanggalMulai.value) {
                const start = new Date(tanggalMulai.value);
                start.setHours(0, 0, 0, 0);
                data = data.filter(item => item.timestamp >= start);
            }
            if (tanggalSelesai.value) {
                const end = new Date(tanggalSelesai.value);
                end.setHours(23, 59, 59, 999);
                data = data.filter(item => item.timestamp <= end);
            }
            return data;
        });

        const laporan = computed(() => {
            const data = filteredRiwayat.value;
            const totalMasuk = data.filter(r => r.tipe === 'MASUK').reduce((sum, item) => sum + item.jumlah, 0);
            const totalKeluar = data.filter(r => r.tipe === 'KELUAR').reduce((sum, item) => sum + item.jumlah, 0);
            return { totalMasuk, totalKeluar };
        });

        // --- Methods ---
        const showSnackbar = (text, color = 'success') => { snackbar.value = { text, color, show: true }; };
        const openDialog = (mode, item = null) => {
          dialogMode.value = mode;
          editedItem.value = item ? { ...item } : { ...defaultItem };
          dialog.value = true;
        };
        const closeDialog = () => { dialog.value = false; };
        
        const simpanDialog = async () => {
          isSubmitting.value = true;
          try {
            if (dialogMode.value === 'tambah') {
              if (!editedItem.value.kode || !editedItem.value.nama) { showSnackbar('Kode dan Nama tidak boleh kosong!', 'error'); return; }
              await addDoc(barangCol, editedItem.value);
              showSnackbar('Barang baru berhasil ditambahkan!');
            } else if (dialogMode.value === 'edit') {
              const docRef = doc(db, 'barang', editedItem.value.id);
              await updateDoc(docRef, { kode: editedItem.value.kode, nama: editedItem.value.nama });
              showSnackbar('Data barang berhasil diupdate!');
            } else if (dialogMode.value === 'hapus') {
              await deleteDoc(doc(db, 'barang', editedItem.value.id));
              showSnackbar('Barang berhasil dihapus!', 'warning');
            }
            closeDialog();
          } catch (e) {
            showSnackbar('Terjadi error!', 'error');
            console.error(e);
          } finally {
            isSubmitting.value = false;
          }
        };

        const catatTransaksi = async (tipe) => {
          if (!formTransaksi.value.id || !(Number(formTransaksi.value.jumlah) > 0)) { showSnackbar('Gagal! Periksa input.', 'error'); return; }
          isSubmitting.value = true;
          const barangRef = doc(db, 'barang', formTransaksi.value.id);
          
          try {
            await runTransaction(db, async (transaction) => {
              const barangDoc = await transaction.get(barangRef);
              if (!barangDoc.exists()) { throw "Barang tidak ditemukan!"; }

              const dataBarang = barangDoc.data();
              const stokBaru = tipe === 'MASUK' ? dataBarang.stok + formTransaksi.value.jumlah : dataBarang.stok - formTransaksi.value.jumlah;

              if (stokBaru < 0) { throw "Stok tidak mencukupi!"; }

              transaction.update(barangRef, { stok: stokBaru });
              
              const riwayatBaru = {
                barangId: formTransaksi.value.id,
                kodeBarang: dataBarang.kode,
                namaBarang: dataBarang.nama,
                jumlah: formTransaksi.value.jumlah,
                tipe: tipe,
                tanggal: serverTimestamp()
              };
              transaction.set(doc(riwayatCol), riwayatBaru);
            });

            showSnackbar(`Transaksi ${tipe.toLowerCase()} berhasil!`);
            formTransaksi.value = { id: null, jumlah: null };
          } catch (e) {
            showSnackbar(`Error: ${e}`, 'error');
            console.error(e);
          } finally {
            isSubmitting.value = false;
          }
        };
        
        const checkStok = (jumlahKeluar) => {
          if (!formTransaksi.value.id) return true;
          const item = barang.value.find(b => b.id === formTransaksi.value.id);
          return (item && item.stok >= Number(jumlahKeluar)) || 'Jumlah melebihi stok!';
        };
        
        const exportStokToExcel = () => {
            const dataArray = barang.value;
            if (!dataArray || dataArray.length === 0) { showSnackbar('Tidak ada data stok untuk diexport', 'warning'); return; }
            
            const dataToExport = dataArray.map(item => ({
                'Kode Barang': item.kode,
                'Nama Barang': item.nama,
                'Stok Saat Ini': item.stok
            }));

            const worksheet = XLSX.utils.json_to_sheet(dataToExport);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Daftar Stok");
            XLSX.writeFile(workbook, `Daftar_Stok_Barang_${new Date().toLocaleDateString('id-ID')}.xlsx`);
        };
        
        const exportLaporanToExcel = () => {
            const dataArray = filteredRiwayat.value;
            if (!dataArray || dataArray.length === 0) {
                showSnackbar('Tidak ada data laporan untuk diexport', 'warning');
                return;
            }
            const summaryData = [
                { 'Laporan Transaksi Gudang': `Periode: ${tanggalMulai.value || 'Semua'} - ${tanggalSelesai.value || 'Semua'}` },
                { '': '' },
                { 'Deskripsi': 'Total Barang Datang', 'Jumlah': laporan.value.totalMasuk },
                { 'Deskripsi': 'Total Barang Keluar', 'Jumlah': laporan.value.totalKeluar }
            ];
            const detailData = dataArray.map(item => ({ 'Tanggal': item.tanggal, 'Kode Barang': item.kodeBarang, 'Nama Barang': item.namaBarang, 'Tipe': item.tipe, 'Jumlah': item.jumlah }));
            const worksheet = XLSX.utils.json_to_sheet(summaryData, { skipHeader: true });
            XLSX.utils.sheet_add_aoa(worksheet, [[' ']], { origin: -1 });
            XLSX.utils.sheet_add_aoa(worksheet, [['Tanggal', 'Kode Barang', 'Nama Barang', 'Tipe', 'Jumlah']], { origin: -1 });
            XLSX.utils.sheet_add_json(worksheet, detailData, { origin: -1, skipHeader: true });
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Laporan");
            XLSX.writeFile(workbook, `Laporan_Transaksi_Gudang.xlsx`);
        };

        const resetFilterTanggal = () => {
            tanggalMulai.value = null;
            tanggalSelesai.value = null;
        };
        
        // --- Lifecycle Hook ---
        onMounted(() => {
          const qBarang = query(barangCol, orderBy("kode"));
          onSnapshot(qBarang, (snapshot) => {
            barang.value = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            isLoading.value = false;
          });

          const qRiwayat = query(riwayatCol, orderBy("tanggal", "desc"));
          onSnapshot(qRiwayat, (snapshot) => {
            riwayat.value = snapshot.docs.map(doc => {
              const data = doc.data();
              const timestamp = data.tanggal ? new Date(data.tanggal.seconds * 1000) : new Date();
              return {
                id: doc.id,
                ...data,
                timestamp: timestamp,
                tanggal: timestamp.toLocaleString('id-ID')
              };
            });
          });
        });

        return {
          currentPage, navValue, search, dialog, dialogMode, snackbar, isLoading, isSubmitting,
          barang, barangHeaders, riwayat, riwayatHeaders, laporan, filteredRiwayat,
          editedItem, formTransaksi,
          pageTitle, dialogTitle,
          tanggalMulai, tanggalSelesai, resetFilterTanggal,
          showSnackbar, openDialog, closeDialog, simpanDialog,
          catatTransaksi, checkStok,
          exportStokToExcel, exportLaporanToExcel
        };
      }
    }).use(vuetify).mount('#app');
