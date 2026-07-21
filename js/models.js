const createSala = (id, tipo, capacidade) => ({
    id, tipo, capacidade
});

const createProfessor = (id, nome, preferencias = {}, indisponibilidades = []) => ({
    id, nome, preferencias, indisponibilidades
});

// Lógica principal adaptada para os múltiplos tipos de laboratórios da UFU
const processarDisciplina = (disc, capacidadeLabPadrao = 40) => {
    let sessoesProcessadas = [];

    disc.componentes.forEach(comp => {
        if (comp.tipo === "Pratica") {
            // Regra de divisão de turmas da FACOM se estourar a capacidade do Lab
            if (disc.alunosMatriculados > capacidadeLabPadrao) {
                const numSubturmas = 2;
                for (let i = 0; i < numSubturmas; i++) {
                    sessoesProcessadas.push({
                        id: `${disc.id}_PRATICA_${String.fromCharCode(65 + i)}`,
                        prof: disc.professorId,
                        disc: `${disc.id} - ${disc.nome} (Lab ${String.fromCharCode(65 + i)})`,
                        periodo: disc.periodo,
                        tipo_sala: comp.tipo_sala, // Pode ser 'Lab' ou 'Lab_Sistemas_Digitais'
                        blocos_necessarios: comp.blocos
                    });
                }
            } else {
                sessoesProcessadas.push({
                    id: `${disc.id}_PRATICA`,
                    prof: disc.professorId,
                    disc: `${disc.id} - ${disc.nome} (Lab)`,
                    periodo: disc.periodo,
                    tipo_sala: comp.tipo_sala,
                    blocos_necessarios: comp.blocos
                });
            }
        } else {
            // Carga Teórica sempre vai para Sala Normal
            sessoesProcessadas.push({
                id: `${disc.id}_TEORIA`,
                prof: disc.professorId,
                disc: `${disc.id} - ${disc.nome} (Teoria)`,
                periodo: disc.periodo,
                tipo_sala: "Normal",
                blocos_necessarios: comp.blocos
            });
        }
    });
    return sessoesProcessadas;
};

module.exports = { createSala, createProfessor, processarDisciplina };