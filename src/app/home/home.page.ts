import { Component, signal, computed, inject } from '@angular/core';
import { IonicModule, AlertController, ModalController, ToastController, LoadingController } from '@ionic/angular';
import { Restaurante } from '../interface/restaurante';
import { RestauranteService } from '../services/restaurante.service';
import { AddRestauranteModalComponent } from '../components/add-restaurante-modal/add-restaurante-modal.component';
import restaurantesJSON from '../../assets/datos/restaurantes.json';
import { addIcons } from 'ionicons';
import { star, sunny } from 'ionicons/icons';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [IonicModule],
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss']
})
export class HomePage {

  // ############################### REGION DATOS ###############################

  private toastCtrl = inject(ToastController);
  private alertCtrl = inject(AlertController);
  private loadingCtrl = inject(LoadingController);
  private modalCtrl = inject(ModalController);
  private restauranteService = inject(RestauranteService);

  constructor() {
    // H2: registramos los iconos de Michelin (estrella) y Repsol (sol)
    addIcons({ star, sunny });
  }

  // Restaurantes leídos del JSON local (usados para la importación a Firebase)
  restaurantes: Restaurante[] = restaurantesJSON as Restaurante[];

  // Signal principal con los restaurantes actualmente cargados (vacío hasta que el usuario pulsa "Cargar datos")
  restaurantesCargados = signal<Restaurante[]>([]);

  // true durante la carga de datos
  cargando = signal(false);

  // H1 - Visibilidad del estado de  carga
  estadoCarga = computed(() => this.cargando() ? 'Cargando restaurantes...' : '');

  // true durante la importación del JSON a Firebase
  importando = signal(false);

  // true cuando hay al menos un restaurante cargado
  hayDatos = computed(() => this.restaurantesCargados().length > 0);

  // Carga los restaurantes desde Firebase y muestra un toast de confirmación
  async cargarDatos() {
    this.cargando.set(true);
    try {
       // H9: si no hay conexión avisamos al instante, sin esperar a Firebase
      if (!navigator.onLine) {
        throw new Error('offline');
      }

      const datos = await this.restauranteService.getAll();
      this.restaurantesCargados.set(datos);
      this.mostrarToast(`${datos.length} restaurantes cargados`, 'success');
    } catch {
      this.mostrarToast('Error al cargar los datos desde Firebase. Comprueba tu conexión a internet', 'danger');
    } finally {
      this.cargando.set(false);
    }
  }

  // Muestra un diálogo de confirmación antes de iniciar la importación
  async confirmarImportacion() {
    const alert = await this.alertCtrl.create({
      header: 'Confirmar importación',
      subHeader: `Se importarán ${this.restaurantes.length} restaurantes`,
      message: 'Los datos actuales de Firebase serán borrados y reemplazados con los del archivo local. ¿Deseas continuar?',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Sí, importar', role: 'confirm', handler: () => this.importarJSON() }
      ]
    });
    await alert.present();
  }

  // Borra todos los datos de Firebase y sube los restaurantes del JSON local
  async importarJSON() {
    this.importando.set(true);
    const loading = await this.loadingCtrl.create({
      message: 'Borrando datos anteriores...',
      backdropDismiss: false
    });
    await loading.present();
    try {
      await this.restauranteService.deleteAll();
      loading.message = 'Subiendo restaurantes...';
      await this.restauranteService.addAll(this.restaurantes);
      await loading.dismiss();
      this.mostrarToast(`${this.restaurantes.length} restaurantes importados correctamente`, 'success');
    } catch (error: any) {
      await loading.dismiss();
      console.error('Error al importar JSON:', error);
      const msg = error?.code === 'permission-denied'
        ? 'Sin permisos en Firebase. Revisa las reglas de seguridad.'
        : 'Error al importar. Revisa tu conexión a internet.';
      this.mostrarToast(msg, 'danger');
    } finally {
      this.importando.set(false);
    }
  }

  // Muestra confirmación y borra el restaurante indicado de Firebase y de la lista local
  async borrarRestaurante(r: Restaurante) {
    const alert = await this.alertCtrl.create({
      header: 'Confirmar borrado',
      subHeader: `¿Deseas borrar el restaurante ${r.documentName}?`,
      message: `Este proceso es irreversible`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Borrar', role: 'confirm', cssClass: 'danger',
          handler: async () => {
            if (!r.id) {
              this.mostrarToast('No se puede borrar: el restaurante no tiene ID.', 'danger');
              return;
            }
            const loading = await this.loadingCtrl.create({
              message: 'Borrando restaurante...',
              backdropDismiss: false
            });
            await loading.present();
            try {
              await new Promise(res => setTimeout(res, 2000));
              await this.restauranteService.delete(r.id);
              this.restaurantesCargados.update(lista => lista.filter(x => x.id !== r.id));
              this.mostrarToastConDeshacer(`${r.documentName} eliminado`, () => this.deshacerBorrado(r));
            } catch {
              this.mostrarToast('Error al borrar el restaurante', 'danger');
            }
            finally{
              await loading.dismiss();
            }
          }
        }
      ]
    });
    await alert.present();
  }
  
  // Recupero el restaurante borrado
  private async deshacerBorrado(r: Restaurante) {
    try {
      await this.restauranteService.add(r);
      await this.cargarDatos();
    } catch {
      this.mostrarToast('Error al deshacer el borrado. Revisa tu conexión.', 'danger');
    }
  }
  // Abre el modal para añadir un restaurante nuevo
  async abrirModalAnadir() {
    const modal = await this.modalCtrl.create({
      component: AddRestauranteModalComponent,
    });
    await modal.present();
    const { role } = await modal.onWillDismiss();
    if (role === 'confirm') {
      await this.cargarDatos();
    }
  }

  // Muestra un toast con el mensaje y color indicados
  private async mostrarToast(mensaje: string, color: 'success' | 'danger' | 'warning') {
    const toast = await this.toastCtrl.create({
      message: mensaje,
      duration: color === 'success' ? 3000:0,
      color,
      position: 'bottom',
      buttons: [{ text: 'X', role: 'cancel' }]
    });
    await toast.present();
  }

  private async mostrarToastConDeshacer(mensaje: string, onDeshacer: () => Promise<void>) {
    const toast = await this.toastCtrl.create({
      message: mensaje,
      duration: 6000,   
      color: 'success',
      position: 'bottom',
      buttons: [
        { text: 'Deshacer', role: 'undo', handler: () => { onDeshacer(); } },
        { text: 'X', role: 'cancel' }
      ]
    });
    await toast.present();
  }

  // ############################### REGION FILTROS (estado general) ###############################

  textoBusqueda = signal('');

  // true si hay algún filtro activo (texto, territorio o localidades)
  hayFiltrosActivos = computed(() =>
    !!this.textoBusqueda() ||
    !!this.territorioSeleccionado() ||
    this.localidadesSeleccionadas().length > 0
  );

  // Resetea todos los filtros a sus valores iniciales
  limpiarTodosFiltros() {
    this.textoBusqueda.set('');
    this.territorioSeleccionado.set('');
    this.localidadesSeleccionadas.set([]);
  }

  // ############################### REGION TERRITORIOS ###############################

  territorioSeleccionado = signal('');

  // Lista de territorios únicos disponibles, ordenada alfabéticamente
  territoriosFiltrados = computed(() => {
    const territorios = this.restaurantesCargados().map(r => r.territory);
    return Array.from(new Set(territorios)).sort();
  });

  // Actualiza el territorio seleccionado y elimina las localidades que ya no pertenecen a él
  onTerritorioChange(value: string) {
    this.territorioSeleccionado.set(value);
    const nuevasLocalidades = this.localidadesSeleccionadas().filter(loc =>
      this.localidadesFiltradasPorTerritorio().includes(loc)
    );
    this.localidadesSeleccionadas.set(nuevasLocalidades);
  }

  quitarTerritorio() {
    if (this.localidadesSeleccionadas().length === 0) {
      this.territorioSeleccionado.set('');
    }
  }
  // ############################### REGION LOCALIDADES ###############################

  localidadesSeleccionadas = signal<string[]>([]);

  // Lista de localidades únicas del territorio seleccionado (o de todos si no hay territorio), ordenada alfabéticamente
  localidadesFiltradasPorTerritorio = computed(() => {
    let lista = this.restaurantesCargados();
    const territorio = this.territorioSeleccionado().toLowerCase().trim();
    if (territorio) {
      lista = lista.filter(r => r.territory?.toLowerCase().trim() === territorio);
    }
    const localities = lista.map(r => r.locality?.trim()).filter((l): l is string => !!l);
    return Array.from(new Set(localities)).sort();
  });

  // Actualiza las localidades seleccionadas con los valores del evento
  onLocalidadesChange(value: string[]) {
    this.localidadesSeleccionadas.set(value);
  }
  
  quitarLocalidad(loc: string) {
    this.localidadesSeleccionadas.update(lista => lista.filter(l => l !== loc));
  }
  // ############################### REGION RESULTADOS ###############################

  // H7 - Ordenación por columna
  sortColumna = signal<string>('documentName');
  sortDireccion = signal<'asc' | 'desc'>('asc');

  cambiarOrden(columna: string) {
    if (this.sortColumna() === columna) {
      this.sortDireccion.update(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortColumna.set(columna);
      this.sortDireccion.set('asc');
    }
  }

  // Lista filtrada de restaurantes según todos los filtros activos
  restaurantesFiltrados = computed(() => {
    let lista = this.restaurantesCargados();

    const texto = this.textoBusqueda().toLowerCase().trim();
    if (texto) {
      lista = lista.filter(r => r.documentName.toLowerCase().includes(texto));
    }

    const territorio = this.territorioSeleccionado().toLowerCase().trim();
    if (territorio) {
      lista = lista.filter(r => r.territory.toLowerCase().trim() === territorio);
    }

    const seleccionadas = this.localidadesSeleccionadas();
    if (seleccionadas.length > 0) {
      lista = lista.filter(r => seleccionadas.includes(r.locality?.trim() || ''));
    }

    const columna = this.sortColumna();
    if (columna) {
      const factor = this.sortDireccion() === 'asc' ? 1 : -1;
      // Las columnas de premios se comparan como números; el resto como texto
      const esNumerica = columna === 'michelinStar' || columna === 'repsolSun';
      // Copiamos la lista con [...lista] para no modificar la original al ordenar
      lista = [...lista].sort((a, b) => {
        const va = (a as any)[columna];
        const vb = (b as any)[columna];
        if (esNumerica) {
          return (Number(va) || 0) - (Number(vb) || 0) === 0
            ? 0
            : ((Number(va) || 0) - (Number(vb) || 0)) * factor;
        }
        return String(va ?? '').localeCompare(String(vb ?? ''), 'es') * factor;
      });
    }

    return lista;
  });

  // ############################### REGION AUXILIARES ###############################

  // Devuelve el número de estrellas Michelin (0 si no tiene o el valor no es numérico)
  estrellasMichelin(r: Restaurante): number {
    return Number(r.michelinStar) || 0;
  }

  // Devuelve el número de soles Repsol (0 si no tiene o el valor no es numérico)
  repsolSoles(r: Restaurante): number {
    return Number(r.repsolSun) || 0;
  }
  repetir (n:number): number[]{
    return Array.from({ length: n}, (_,i) => i);
  }
}